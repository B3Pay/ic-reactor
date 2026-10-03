// Scenario 5 (and every command): one switch over the ReactorError kind.
//
// Every rejection a client call produces is a ReactorError: test with
// `isReactorError(error)`, then read `kind`, and `mayHaveExecuted` for whether
// a write may have taken effect anyway (packages/core/llms.txt, Errors). This
// file turns that into what a person or an agent acts on: an exit code per
// kind, the library's message, and what to do next. A kind the switch does
// not handle fails the type check (`never` below).
//
// Exit codes (the README's table):
//   0 ok · 1 unexpected · 2 usage · 3 invalid_args · 4 unauthenticated
//   5 not_delivered · 6 outcome_unknown · 7 rejected · 8 invalid_reply
//   9 canister_err · 10 cancelled
import { isReactorError, type ReactorErrorKind } from "@ic-reactor/core"
import { SEED_VARIABLE } from "./identity.ts"
import { UsageError } from "./input.ts"
import type { FailureDoc, Json, Output } from "./output.ts"

/** A ReactorError kind, or a refusal of this tool's own ("usage"), or a bug ("unexpected"). */
export type FailureKind = ReactorErrorKind | "usage" | "unexpected"

/** The process exit code of each outcome. */
export const EXIT_CODES = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  invalid_args: 3,
  unauthenticated: 4,
  not_delivered: 5,
  outcome_unknown: 6,
  rejected: 7,
  invalid_reply: 8,
  canister_err: 9,
  cancelled: 10,
} as const satisfies Record<"ok" | FailureKind, number>

/** A failure, read once. */
export interface Failure {
  readonly kind: FailureKind
  /** Whether a write may have taken effect although it failed. */
  readonly mayHaveExecuted: boolean
  readonly message: string
  /** What to do next, in a sentence or two. */
  readonly advice: string
  readonly exitCode: number
  /** The ReactorError fields an agent may branch on, when there are any. */
  readonly details: {
    readonly code?: string
    readonly rejectCode?: number
    readonly httpStatus?: number
  }
}

/**
 * Reads any thrown value as a {@link Failure}.
 *
 * @param sent - Whether the failure came from sending a write: a value that is
 * not a ReactorError then cannot prove the write did not happen.
 */
export function failureOf(error: unknown, sent = false): Failure {
  if (error instanceof UsageError) {
    return {
      kind: "usage",
      mayHaveExecuted: false,
      message: error.message,
      advice: "Nothing was sent. Run with --help for the commands and flags.",
      exitCode: EXIT_CODES.usage,
      details: {},
    }
  }
  if (!isReactorError(error)) {
    return {
      kind: "unexpected",
      mayHaveExecuted: sent,
      message: error instanceof Error ? error.message : String(error),
      advice: sent
        ? "This is a bug in the tool, and the write may have gone out: read the balance before anything else."
        : "This is a bug in the tool.",
      exitCode: EXIT_CODES.unexpected,
      details: {},
    }
  }

  const { kind, mayHaveExecuted, rejectCode } = error
  let advice: string
  switch (kind) {
    case "invalid_args":
      advice =
        "The arguments did not encode, so nothing was sent. Fix the input."
      break
    case "unauthenticated":
      advice =
        `This command writes, and the client has no identity to sign with, so it refused before sending. ` +
        `Pass --pem <file> or set ${SEED_VARIABLE}.`
      break
    case "not_delivered":
      advice =
        "Nothing ran that changed anything: the request was refused or never got in, or it was a read that got no answer " +
        "(the client already sent it again where that was safe). It is safe to run again."
      break
    case "outcome_unknown":
      advice =
        "It went out and no trustworthy answer came back, so it may have executed. Read the state back before anything else; never send a new one blindly."
      break
    case "rejected":
      advice = mayHaveExecuted
        ? `Reject code ${rejectCode}: the canister rejected or trapped, possibly after changing state. Read the state back before anything else.`
        : rejectCode === 4 || rejectCode === 5
          ? `Reject code ${rejectCode}: the canister rejected or trapped a read, which changes nothing. Is it an ICRC-1 ledger?`
          : `Reject code ${rejectCode}: refused before any canister code ran, so nothing executed.`
      break
    case "invalid_reply":
      advice = mayHaveExecuted
        ? "The write ran, but its reply did not decode. Read the state back."
        : "The reply did not decode as this method's result: is the canister an ICRC-1 ledger?"
      break
    case "canister_err":
      advice =
        "The canister ran the call and answered Err: that answer is final."
      break
    case "cancelled":
      advice = mayHaveExecuted
        ? "The call was abandoned after it went out, so it may have executed. Read the state back."
        : "The call was cancelled before it was sent."
      break
    default: {
      const unhandled: never = kind
      throw new Error(`unhandled kind ${String(unhandled)}`)
    }
  }

  return {
    kind,
    mayHaveExecuted,
    message: error.message,
    advice,
    exitCode: EXIT_CODES[kind],
    details: {
      ...(error.code === undefined ? {} : { code: error.code }),
      ...(rejectCode === undefined ? {} : { rejectCode }),
      ...(error.httpStatus === undefined
        ? {}
        : { httpStatus: error.httpStatus }),
    },
  }
}

/**
 * Prints a failure and returns its exit code. `extra` adds fields to the JSON
 * document, `lines` lines for a person after the standard ones.
 */
export function reportFailure(
  out: Output,
  command: string | null,
  failure: Failure,
  extra: { readonly [field: string]: Json | undefined } = {},
  lines: readonly string[] = []
): number {
  const doc: FailureDoc = {
    ok: false,
    command,
    kind: failure.kind,
    mayHaveExecuted: failure.mayHaveExecuted,
    message: failure.message,
    ...failure.details,
    ...extra,
  }
  out.failure(doc, [
    `error: ${failure.kind}: ${failure.message}`,
    `  may have executed: ${failure.mayHaveExecuted ? "yes" : "no"}`,
    `  ${failure.advice}`,
    ...lines.map((line) => `  ${line}`),
  ])
  return failure.exitCode
}
