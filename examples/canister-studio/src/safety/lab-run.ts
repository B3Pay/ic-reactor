import {
  isReactorError,
  type Canister,
  type ReactorError,
} from "@ic-reactor/core"
import type { DynActor } from "../lib/reactor.ts"
import {
  createLab,
  type Lab,
  type LabOptions,
  type TestRequest,
} from "./mock-ledger.ts"

// What every scenario shares: the result it hands the page, and a runner
// that CHECKS what ic-reactor did, step by step. A check that does not hold
// fails the verdict, so the page says so instead of telling a story the
// library no longer backs.

/** One line of a run: something the scenario did, or a check of what came back. */
export interface ScenarioStep {
  readonly label: string
  readonly detail?: string
  /** `pass`/`fail` for a check of ic-reactor's behaviour, `info` for an action. */
  readonly status: "pass" | "fail" | "info"
}

/** A request the in-memory replica received, as plain data. */
export interface LoggedRequest {
  readonly endpoint: TestRequest["endpoint"]
  readonly methodName?: string
  readonly canisterId?: string
  readonly caller?: string
  readonly refused?: string
  readonly dropped?: boolean
}

export interface ScenarioVerdict {
  /** Every check held: ic-reactor behaved as the scenario claims. */
  readonly pass: boolean
  readonly summary: string
}

/** A failure to show with `ErrorPanel`, captioned. */
export interface LabeledError {
  readonly label: string
  readonly error: unknown
}

export interface ScenarioReply {
  readonly method: string
  readonly value: unknown
  /** Format the value with the ledger's units (a balance, not a block index). */
  readonly tokens: boolean
}

export interface ScenarioResult {
  readonly verdict: ScenarioVerdict
  readonly steps: readonly ScenarioStep[]
  readonly requests: readonly LoggedRequest[]
  /** The failure the scenario is about, for `ErrorPanel`. */
  readonly error?: unknown
  /** Later failures worth showing too (a re-send's `Duplicate`). */
  readonly moreErrors?: readonly LabeledError[]
  /** A reply to show with `ReplyView`. */
  readonly reply?: ScenarioReply
  /** Argument values to show in a `MethodForm`, with the error's issues on its fields. */
  readonly form?: {
    readonly method: string
    readonly values: readonly unknown[]
  }
}

export interface Scenario {
  /** Stable id: the card's anchor and test name. */
  readonly id: string
  readonly title: string
  /** The rule of the consumer guide (llms.txt) the scenario holds ic-reactor to. */
  readonly rule: string
  readonly narrative: string
  /** What a passing run shows, in one line; also what the page shows when the lab cannot run. */
  readonly expected: string
  /** The code the scenario runs after the common setup, abridged, as static text. */
  readonly code: string
  run(): Promise<ScenarioResult>
}

/** Collects the steps of a run; a check that fails turns the verdict. */
export interface Recorder {
  note(label: string, detail?: string): void
  check(label: string, ok: boolean, detail?: string): boolean
  /** A check that `actual` is `expected` (`Object.is`), showing both when not. */
  same(label: string, actual: unknown, expected: unknown): boolean
}

type Extras = Omit<ScenarioResult, "verdict" | "steps" | "requests">

/** Runs `body` against a fresh lab; a throw becomes a failed verdict, never a crash. */
export async function runInLab(
  options: LabOptions,
  body: (lab: Lab, r: Recorder) => Promise<Extras>
): Promise<ScenarioResult> {
  const steps: ScenarioStep[] = []
  const recorder: Recorder = {
    note: (label, detail) => void steps.push(step(label, "info", detail)),
    check(label, ok, detail) {
      steps.push(step(label, ok ? "pass" : "fail", detail))
      return ok
    },
    same(label, actual, expected) {
      const ok = Object.is(actual, expected)
      return recorder.check(
        label,
        ok,
        ok ? show(actual) : `expected ${show(expected)}, got ${show(actual)}`
      )
    },
  }
  let lab: Lab | undefined
  let extras: Extras = {}
  try {
    lab = await createLab(options)
    extras = await body(lab, recorder)
  } catch (cause) {
    recorder.check("The scenario ran to the end", false, describeFailure(cause))
  }
  const requests = lab === undefined ? [] : lab.kit.requests.map(logged)
  lab?.client.dispose()
  const failed = steps.filter((s) => s.status === "fail")
  const checks = steps.filter((s) => s.status !== "info").length
  return {
    verdict:
      failed.length === 0
        ? { pass: true, summary: `All ${checks} checks held.` }
        : {
            pass: false,
            summary: `ic-reactor behaved differently: ${failed
              .map((s) => s.label)
              .join("; ")}.`,
          },
    steps,
    requests,
    ...extras,
  }
}

function step(
  label: string,
  status: ScenarioStep["status"],
  detail: string | undefined
): ScenarioStep {
  return detail === undefined ? { label, status } : { label, status, detail }
}

export function logged(r: TestRequest): LoggedRequest {
  return {
    endpoint: r.endpoint,
    ...(r.methodName === undefined ? {} : { methodName: r.methodName }),
    ...(r.canisterId === undefined ? {} : { canisterId: r.canisterId }),
    ...(r.caller === undefined ? {} : { caller: r.caller }),
    ...(r.refused === undefined ? {} : { refused: r.refused }),
    ...(r.dropped === true ? { dropped: true } : {}),
  }
}

/** Text for a value in a check's detail: bigint stays exact. */
export function show(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "string") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`
  return String(value)
}

/** A failure in one line: a ReactorError's kind and fields, or the message. */
export function describeFailure(error: unknown): string {
  if (isReactorError(error)) {
    const parts = [
      `kind ${error.kind}`,
      error.code === undefined ? undefined : `code ${error.code}`,
      error.rejectCode === undefined
        ? undefined
        : `rejectCode ${error.rejectCode}`,
      error.httpStatus === undefined
        ? undefined
        : `httpStatus ${error.httpStatus}`,
      `mayHaveExecuted ${error.mayHaveExecuted}`,
    ]
    return parts.filter((p) => p !== undefined).join(", ")
  }
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** Settles `run` into its value or the failure it threw or rejected with. */
export async function settle<T>(
  run: () => T | Promise<T>
): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error }
  }
}

/** The failure of a step that must fail; records a failed check when it succeeded. */
export function failureOf<T>(
  r: Recorder,
  label: string,
  result: Settled<T>
): unknown {
  if (result.ok) {
    r.check(label, false, `it succeeded with ${show(result.value)}`)
    return undefined
  }
  r.check(label, true, describeFailure(result.error))
  return result.error
}

/** The value of a step that must succeed; records a failed check when it threw. */
export function valueOf<T>(
  r: Recorder,
  label: string,
  result: Settled<T>
): T | undefined {
  if (!result.ok) {
    r.check(label, false, describeFailure(result.error))
    return undefined
  }
  r.check(label, true, show(result.value))
  return result.value
}

/** Long hex, cut for a check's detail. */
export const clip = (text: string): string =>
  text.length > 28 ? `${text.slice(0, 20)}…${text.slice(-6)}` : text

/**
 * A failure's ReactorError fields, or `undefined` for any other failure, so
 * that every check of a field fails rather than being skipped.
 */
export const fieldsOf = (error: unknown): ReactorError<unknown> | undefined =>
  isReactorError(error) ? error : undefined

/** The paths of an `invalid_args` failure's issues. */
export const issuePaths = (error: unknown): readonly string[] =>
  isReactorError(error) ? (error.issues ?? []).map((issue) => issue.path) : []

/** Whether `value` is there, recorded as a check; narrows it when it is. */
export function present<T>(
  r: Recorder,
  label: string,
  value: T | undefined
): value is T {
  return r.check(label, value !== undefined)
}

/** Calls `method` of an untyped canister view, which may not have it. */
export function callUntyped(
  canister: Canister<DynActor>,
  method: string,
  arg: unknown
): Promise<unknown> {
  const call = canister[method]
  if (call === undefined) {
    throw new TypeError(`the canister has no method ${method}`)
  }
  return call(arg)
}

/** The canister requests (queries and calls) that named `method`. */
export const sent = (lab: Lab, method: string): readonly TestRequest[] =>
  lab.kit.requests.filter(
    (r) =>
      (r.endpoint === "call" || r.endpoint === "query") &&
      r.methodName === method
  )
