import {
  isReactorError,
  type ReactorError,
  type ReactorErrorKind,
} from "@ic-reactor/core"

/** What each kind means, from the Errors table of `@ic-reactor/core`'s guide. */
export const KIND_INFO: Readonly<
  Record<ReactorErrorKind, { readonly title: string; readonly meaning: string }>
> = {
  invalid_args: {
    title: "Refused before sending",
    meaning:
      "The arguments do not encode as the method's Candid types (or a held re-send's argument changed since it was sent). Nothing was sent.",
  },
  unauthenticated: {
    title: "Refused before sending",
    meaning:
      "A write needs a signed-in caller, and the caller is anonymous. Nothing was sent.",
  },
  not_delivered: {
    title: "Not delivered",
    meaning:
      "The replica or a boundary node refused the request (HTTP 4xx other than 408, 429 included), the IC could not take it in (reject code 2), or a read got no answer. Nothing ran.",
  },
  outcome_unknown: {
    title: "Outcome unknown",
    meaning:
      "The call went out and no trustworthy answer came back: a network drop, a timeout, HTTP 5xx or 408. It may or may not have run.",
  },
  rejected: {
    title: "Rejected",
    meaning: "The IC or the canister rejected the call.",
  },
  invalid_reply: {
    title: "Reply did not decode",
    meaning:
      "A reply came back, but not as the method's result type. A write may have run anyway.",
  },
  canister_err: {
    title: "The canister answered Err",
    meaning:
      "The method ran and answered with the Err arm of its result: that is the outcome. Sending again is a new decision, not a retry.",
  },
  cancelled: {
    title: "Cancelled",
    meaning:
      "The caller changed, the call was aborted, or a held re-send would have gone elsewhere.",
  },
}

/** The sub-reasons a `ReactorError` can carry, in plain words. */
const CODE_INFO: ReadonlyMap<string, string> = new Map(
  Object.entries({
    anonymous_write:
      "Nobody is signed in, and the client never sends a write as the anonymous principal.",
    identity_unavailable: "The signed-in identity could not be loaded.",
    caller_changed:
      "Someone else is signed in now: a call is made as the principal it was built for, or not at all.",
    target_changed:
      "A held re-send may go only to the method and canister its first send went to.",
    arg_changed:
      "The held re-send's argument no longer encodes to the bytes first sent.",
    client_disposed: "The client was disposed: nothing was sent.",
    canister_not_found: "The IC answered that no canister exists at this id.",
    canister_id_unresolved: "The canister's id could not be resolved.",
    no_certified_path:
      "A composite query has no certified path: read it without certification.",
    effective_canister_id_unknown:
      "The management canister call names no canister to route it by.",
  })
)

/** A `ReactorError` code in plain words, or `undefined` for a code this app does not know. */
export const codeMeaning = (code: string): string | undefined =>
  CODE_INFO.get(code)

/** The reject codes of the IC interface specification. */
const REJECT_NAMES: readonly string[] = [
  "",
  "SYS_FATAL",
  "SYS_TRANSIENT",
  "DESTINATION_INVALID",
  "CANISTER_REJECT",
  "CANISTER_ERROR",
  "SYS_UNKNOWN",
]

/** The name of a reject code (`5` → `CANISTER_ERROR`), or `undefined` for any other number. */
export const rejectName = (code: number): string | undefined =>
  Number.isInteger(code) && code >= 1 ? REJECT_NAMES[code] : undefined

/**
 * What a reject code says about whether canister code ran. On the
 * management canister (`aaaaa-aa`) the codes prove nothing: it may have
 * acted before rejecting.
 */
export function rejectMeaning(
  code: number,
  write: boolean,
  canisterId?: string
): string {
  if (canisterId === "aaaaa-aa") {
    return "On the management canister, a reject code proves nothing about what ran."
  }
  if (code === 1 || code === 3) {
    return "Rejected before any canister code ran."
  }
  if (code === 2) return "The IC could not take the request in (transient)."
  if (code === 4 || code === 5) {
    return write
      ? "The canister rejected or trapped, maybe after changing state."
      : "The canister rejected or trapped."
  }
  return "The IC could not say what happened."
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined

/**
 * What the agent's own error adds to a `ReactorError`. The client cuts its
 * `message` to 160 characters, and keeps the agent's error as a
 * non-enumerable `cause`: the full reject text and the IC error code
 * (`IC0536`) are read from `cause.code`.
 */
export interface CauseDetails {
  readonly name?: string
  readonly rejectMessage?: string
  readonly rejectErrorCode?: string
  readonly bodyText?: string
}

export function causeDetails(error: {
  readonly cause?: unknown
}): CauseDetails {
  const cause = error.cause
  if (typeof cause !== "object" || cause === null) return {}
  const code = (cause as { code?: unknown }).code
  const fields =
    typeof code === "object" && code !== null
      ? (code as Record<string, unknown>)
      : {}
  return {
    name: text(fields.name) ?? text((cause as { name?: unknown }).name),
    rejectMessage: text(fields.rejectMessage),
    rejectErrorCode: text(fields.rejectErrorCode),
    bodyText: text(fields.bodyText),
  }
}

/** The three answers to "did it happen?" a failed call can give. */
export type Verdict = "may_have_executed" | "answered_err" | "not_executed"

export function verdictOf(error: ReactorError<unknown>): Verdict {
  if (error.mayHaveExecuted) return "may_have_executed"
  if (error.kind === "canister_err") return "answered_err"
  return "not_executed"
}

/** A short line for the history list and logs: `kind/code: …`. */
export function errorSummary(error: unknown): string {
  if (!isReactorError(error)) {
    return error instanceof Error ? error.message : String(error)
  }
  const head =
    error.code === undefined ? error.kind : `${error.kind}/${error.code}`
  return error.mayHaveExecuted ? `${head} (may have executed)` : head
}
