/**
 * One error type for every failure an ic-reactor call reports, and the
 * classifier that turns what `@icp-sdk/core` throws into it.
 *
 * The question a UI has to answer after a failed write is not "what went
 * wrong" but "did it happen anyway". Every {@link ReactorError} therefore
 * carries `mayHaveExecuted`, derived here from the failure and the call mode
 * so that no application has to read reject codes or HTTP statuses itself.
 *
 * Only {@link ReactorError}, {@link ReactorErrorKind} and
 * {@link isReactorError} are part of the package entry. Everything else in
 * this module is internal and exported only for the client that builds on it.
 *
 * @module
 */
import { isServer } from "./runtime.js"

/**
 * What kind of failure a {@link ReactorError} reports.
 *
 * - `invalid_args`: the arguments could not be encoded, or the target canister
 *   id could not be resolved. Nothing was sent.
 * - `unauthenticated`: an update was attempted while not signed in. Nothing was
 *   sent.
 * - `not_delivered`: the request certainly did not reach the canister (the
 *   replica or a boundary node refused it, or the system could not take it in).
 * - `outcome_unknown`: an update went out and no trustworthy answer came back,
 *   so the canister may or may not have run it.
 * - `rejected`: the IC or the canister rejected the call; `rejectCode` says which.
 * - `invalid_reply`: a reply arrived but did not decode as the method's result.
 * - `canister_err`: the canister replied with the `Err` arm of its result; `err`
 *   is typed.
 * - `cancelled`: the caller abandoned the call (an aborted query, or a key
 *   whose principal is no longer current).
 */
export type ReactorErrorKind =
  | "invalid_args"
  | "unauthenticated"
  | "not_delivered"
  | "outcome_unknown"
  | "rejected"
  | "invalid_reply"
  | "canister_err"
  | "cancelled"

type ReactorErrorBase = Error & {
  readonly name: "ReactorError"
  /**
   * Whether the canister may have run the call despite this failure. `true`
   * is a warning, not a verdict: re-sending could run the call twice, so read
   * the state back before trying again.
   */
  readonly mayHaveExecuted: boolean
  /** The Candid method that was called. */
  readonly method: string
  /** The target canister, as text. */
  readonly canisterId: string
  /**
   * A machine-readable sub-reason within a `kind`, such as
   * `"canister_id_unresolved"` for an unresolved `{ name }` target or
   * `"anonymous_write"` for an update without a signed-in identity.
   */
  readonly code?: string
  /** The IC reject code (1 to 6, or whatever the replica sent), when there was one. */
  readonly rejectCode?: number
  /** The HTTP status the replica or a boundary node answered with, when there was one. */
  readonly httpStatus?: number
  /** Which parts of the arguments or the reply failed to encode or decode. */
  readonly issues?: readonly { code: string; path: string; message: string }[]
  /** The error that caused this one, when there is one. */
  readonly cause?: unknown
}

/**
 * The error every ic-reactor call rejects with.
 *
 * Narrow on `kind`. For a method whose result has an `Err` arm, `E` is that
 * arm's type, and `err` is typed `E` exactly when `kind` is `"canister_err"`
 * (and `undefined` for every other kind). `E` defaults to `never`, which
 * stands for a method without an `Err` arm: `err` is then always `undefined`.
 *
 * @example
 * ```ts
 * try {
 *   await ledger.icrc1_transfer(args)
 * } catch (e) {
 *   if (isReactorError(e) && e.mayHaveExecuted) {
 *     // Do not re-send: read the balance back first.
 *   }
 * }
 * ```
 */
export type ReactorError<E = never> = [E] extends [never]
  ? ReactorErrorBase & {
      readonly kind: ReactorErrorKind
      readonly err?: undefined
    }
  : ReactorErrorBase &
      (
        | {
            readonly kind: Exclude<ReactorErrorKind, "canister_err">
            readonly err?: undefined
          }
        | { readonly kind: "canister_err"; readonly err: E }
      )

/**
 * Brand on every error this module creates. `Symbol.for` returns the same
 * symbol in every copy of the package, so a guard from one copy recognises an
 * error thrown by another (a version range the package manager cannot dedupe,
 * or a bundler that pre-bundles one importer and not the other), which
 * `instanceof` cannot do.
 */
const BRAND = Symbol.for("ic-reactor.ReactorError")

/**
 * Marks an error as one that is safe to send again. Internal: it is not part
 * of {@link ReactorError}. Shared across copies for the same reason as
 * {@link BRAND}.
 */
const RETRYABLE = Symbol.for("ic-reactor.ReactorError.retryable")

/**
 * Whether `error` is a {@link ReactorError}, including one created by another
 * copy of this package. Narrows to `ReactorError<unknown>`: after a check on
 * `kind === "canister_err"`, `err` is `unknown`.
 */
export function isReactorError(error: unknown): error is ReactorError<unknown> {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[BRAND] === true
  )
}

// ---------------------------------------------------------------------------
// Creating errors
// ---------------------------------------------------------------------------

type Issues = NonNullable<ReactorErrorBase["issues"]>

/** Whether a call reads (`query`) or writes (`update`). */
export type CallMode = "query" | "update"

/** Fields shared by every error the client creates itself. */
export interface ReactorErrorFields {
  /** The Candid method that was called. */
  readonly method: string
  /** The target canister as text, or the `$unresolved:<name>` placeholder. */
  readonly canisterId: string
  /**
   * A short, readable reason. It is appended to
   * `[ic-reactor] <method> on <canisterId>: ` to form `message`. Each kind has
   * a default.
   */
  readonly reason?: string
  /** A machine-readable sub-reason: `ReactorError.code`. */
  readonly code?: string
  readonly issues?: Issues
  readonly cause?: unknown
}

interface BuildInit extends ReactorErrorFields {
  readonly kind: ReactorErrorKind
  readonly mayHaveExecuted: boolean
  readonly reason: string
  readonly rejectCode?: number
  readonly httpStatus?: number
  readonly err?: unknown
  readonly retryable?: boolean
}

class ReactorFailure extends Error {
  declare readonly kind: ReactorErrorKind
  declare readonly mayHaveExecuted: boolean
  declare readonly method: string
  declare readonly canisterId: string
  declare readonly code?: string
  declare readonly rejectCode?: number
  declare readonly httpStatus?: number
  declare readonly issues?: Issues
  declare readonly err?: unknown
  declare readonly cause?: unknown

  constructor(init: BuildInit) {
    super(`[ic-reactor] ${init.method} on ${init.canisterId}: ${init.reason}`)
    // Absent fields stay absent (no own key), so `"err" in error` and
    // `JSON.stringify` mean what they say.
    const own: Record<string, unknown> = {
      kind: init.kind,
      mayHaveExecuted: init.mayHaveExecuted,
      method: init.method,
      canisterId: init.canisterId,
    }
    for (const key of ["code", "rejectCode", "httpStatus", "issues"]) {
      const value = init[key as keyof BuildInit]
      if (value !== undefined) own[key] = value
    }
    if (init.kind === "canister_err") own.err = init.err
    Object.assign(this, own)
    // Like the platform's own `cause`: present, but not enumerable.
    if (init.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        value: init.cause,
        writable: true,
        configurable: true,
      })
    }
    Object.defineProperty(this, BRAND, { value: true })
    Object.defineProperty(this, RETRYABLE, { value: init.retryable === true })
  }
}

// Defined on the prototype so the stack header reads `ReactorError: ...`.
Object.defineProperty(ReactorFailure.prototype, "name", {
  value: "ReactorError",
  writable: true,
  configurable: true,
})

const build = <E = never>(init: BuildInit): ReactorError<E> =>
  new ReactorFailure(init) as unknown as ReactorError<E>

const DEFAULT_REASON = {
  invalid_args: "the arguments could not be encoded",
  unauthenticated: "an update needs a signed-in identity",
  cancelled: "the call was cancelled",
  invalid_reply: "the reply did not decode as the method's result",
  canister_err: "the canister returned an Err",
} as const

/**
 * Creates a {@link ReactorError} for a failure the client detects itself,
 * where there is no agent error to classify.
 *
 * `mayHaveExecuted` is derived, never passed in: `invalid_args`,
 * `unauthenticated`, `cancelled` and `canister_err` always say `false` (the
 * client refuses before sending, or the canister answered with a decision),
 * and `invalid_reply` needs the call `mode` because a write whose reply cannot
 * be read has still run, and a read has not.
 *
 * Errors made here are never retryable.
 */
export function createReactorError(
  kind: "invalid_args" | "unauthenticated" | "cancelled",
  fields: ReactorErrorFields
): ReactorError
export function createReactorError(
  kind: "invalid_reply",
  fields: ReactorErrorFields & { readonly mode: CallMode }
): ReactorError
export function createReactorError<E>(
  kind: "canister_err",
  fields: ReactorErrorFields & { readonly err: E }
): ReactorError<E>
export function createReactorError(
  kind: keyof typeof DEFAULT_REASON,
  fields: ReactorErrorFields & {
    readonly mode?: CallMode
    readonly err?: unknown
  }
): ReactorError<unknown> {
  const { mode, err, reason, ...rest } = fields
  return build({
    ...rest,
    kind,
    reason: reason ?? DEFAULT_REASON[kind],
    mayHaveExecuted: kind === "invalid_reply" && mode === "update",
    err,
  })
}

/**
 * Creates the `invalid_reply` error for a reply that did not decode as the
 * method's result type: `mayHaveExecuted` is `true` on an update (the canister
 * ran it, and only the answer is unreadable) and `false` on a query.
 */
export function invalidReplyError(
  context: Pick<ErrorContext, "method" | "canisterId" | "mode">,
  details: Pick<ReactorErrorFields, "reason" | "issues" | "cause"> = {}
): ReactorError {
  return createReactorError("invalid_reply", {
    method: context.method,
    canisterId: context.canisterId,
    mode: context.mode,
    ...details,
  })
}

// ---------------------------------------------------------------------------
// Classifying what the agent (@icp-sdk/core 6) throws. Read structurally:
// `kind`, `code.name`, `code.rejectCode`, `code.status`; never `instanceof`, so
// an error from another copy of the agent classifies the same way.
// ---------------------------------------------------------------------------

/** What the classifier needs to know about the call that failed. */
export interface ErrorContext {
  readonly method: string
  /** The target canister, as text. `aaaaa-aa` is the management canister. */
  readonly canisterId: string
  readonly mode: CallMode
  /**
   * An update only: the replica has already accepted the request. Pass `true`
   * once the agent's `onPollingStarted` has fired. From then on an HTTP error
   * (a 429 from a rate-limited `read_state`, an expired delegation) says
   * nothing about the update, which is already in the IC, so it classifies as
   * `outcome_unknown` instead of `not_delivered`. Without this, a 429 while
   * polling would read as "not delivered, safe to re-send" and run the call
   * twice.
   */
  readonly accepted?: boolean
  /**
   * The signal the call ran under. If it has aborted, the caller is gone and
   * the failure is `cancelled`, whatever the agent reported.
   */
  readonly signal?: AbortSignal
}

// Which reject codes prove that an update call changed nothing.
//
// Per the IC interface specification (docs/references/ic-interface-spec.md in
// dfinity/portal, section "Reject codes" and the rules of "Abstract behavior"):
//
// - SYS_FATAL (1) and SYS_TRANSIENT (2) reach an ingress call only from
//   "Request rejection" ("The IC may reject a received message for internal
//   reasons ... Code = SYS_FATAL or Code = SYS_TRANSIENT"), before the request
//   is processed, and SYS_TRANSIENT also from "Calls to frozen canisters are
//   rejected", which happens before a call context is created. No canister
//   code runs. Exception: a pending `stop_canister` on the management canister
//   "may be rejected by the system at any time (the canister stays stopping in
//   this case)" with SYS_TRANSIENT, after its effect, so calls to aaaaa-aa
//   are not given this guarantee.
// - DESTINATION_INVALID (3): "Invalid destination (e.g. canister/account does
//   not exist)": there was nothing to run.
// - CANISTER_REJECT (4) is "always" what `ic0.msg_reject` produces ("the
//   canister cannot freely specify the reject code"); the execution that
//   rejects returns normally, and "If message execution returns ..., the
//   state is updated". So the canister's changes stand.
// - CANISTER_ERROR (5) covers a trap, whose "state mutation is discarded"
//   only for the trapping execution: executions of the same call before an
//   inter-canister await were already committed. It also covers call-context
//   starvation, where "the state changes are persisted even when the IC is
//   set to synthesize a CANISTER_ERROR reject". It can also mean the canister
//   was stopped and never ran, but a client cannot tell which.
// - SYS_UNKNOWN (6) "is only applicable to inter-canister calls that used
//   ic0.call_with_best_effort_response"; seen on an ingress call it proves
//   nothing, so it counts as unknown.
//
// So: 1, 2, 3 are no effect (2 alone is also safe to re-send); 4, 5, 6 and any
// code not listed may have executed.
const SYS_FATAL = 1
const SYS_TRANSIENT = 2
const DESTINATION_INVALID = 3
const MANAGEMENT_CANISTER = "aaaaa-aa"

const REJECT_NAMES: Readonly<Record<number, string>> = {
  1: "SYS_FATAL",
  2: "SYS_TRANSIENT",
  3: "DESTINATION_INVALID",
  4: "CANISTER_REJECT",
  5: "CANISTER_ERROR",
  6: "SYS_UNKNOWN",
}

/** The longest detail text a ReactorError's `message` carries. */
const MAX_DETAIL = 160

/**
 * What the classifier reads off whatever was thrown. Every field comes from a
 * property read, so a plain object of the same shape reads the same as the
 * agent's own classes.
 */
interface Shape {
  /** The agent's `ErrorKindEnum` value, such as `"Reject"` or `"Transport"`. */
  readonly kind: string | undefined
  /** The `name` of the agent's `ErrorCode`, such as `"HttpErrorCode"`. */
  readonly codeName: string | undefined
  readonly rejectCode: number | undefined
  readonly httpStatus: number | undefined
  /** Short human text from the error: a reject message, an HTTP body, ... */
  readonly detail: string
  readonly statusText: string
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

/**
 * The reject code of a `RejectError`. The agent nests it (the error's `code` is
 * a `...RejectErrorCode` carrying `rejectCode`); the flat position is read too,
 * so a hand-built or future-shaped error still classifies.
 */
function readRejectCode(error: Record<string, unknown>): number | undefined {
  const flat = error.rejectCode
  if (typeof flat === "number") return flat
  const nested = asRecord(error.code).rejectCode
  return typeof nested === "number" ? nested : undefined
}

/**
 * The HTTP status of a `ProtocolError` whose `code` is an `HttpErrorCode`.
 * Recognised by the code's `name` and `status`, not with `instanceof`, so an
 * error from another copy of `@icp-sdk/core` classifies the same way. A
 * `status` on any other code says nothing about an HTTP answer and is ignored.
 */
function readHttpStatus(error: Record<string, unknown>): number | undefined {
  const code = asRecord(error.code)
  return code.name === "HttpErrorCode" && typeof code.status === "number"
    ? code.status
    : undefined
}

/**
 * One line of at most {@link MAX_DETAIL} characters. The agent's own messages
 * run to many lines (headers, the request context, an HTTP body), which would
 * bury what a person reading a toast or a log needs.
 */
function condense(text: string | undefined): string {
  if (text === undefined) return ""
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > MAX_DETAIL ? `${line.slice(0, MAX_DETAIL - 1)}…` : line
}

function messageOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : asString(asRecord(value).message)
}

function readShape(error: unknown): Shape {
  const record = asRecord(error)
  const code = asRecord(record.code)
  const codeName = asString(code.name)
  const rejectCode = readRejectCode(record)
  const httpStatus = readHttpStatus(record)
  // The text that says the most, per code. An HTTP refusal's body names the
  // problem; a reject carries the canister's or the IC's message; a transport
  // failure wraps the fetch error. Anything else falls back to the error's
  // own message, which a non-agent error keeps short.
  const detail =
    asString(code.rejectMessage) ??
    asString(code.bodyText) ??
    (codeName === "HttpFetchErrorCode" ? messageOf(code.error) : undefined) ??
    asString(code.message) ??
    messageOf(error)
  return {
    kind: asString(record.kind),
    codeName,
    rejectCode,
    httpStatus,
    detail: condense(detail),
    statusText: condense(asString(code.statusText)),
  }
}

/** Whether `error`, or what it wraps, is an abort. */
function isAbort(error: unknown, depth = 0): boolean {
  if (depth > 3) return false
  const record = asRecord(error)
  if (record.name === "AbortError") return true
  // The agent wraps a fetch failure, abort included, as
  // `TransportError(HttpFetchErrorCode(error))`.
  return isAbort(asRecord(record.code).error, depth + 1)
}

const withDetail = (lead: string, detail: string): string =>
  detail === "" ? lead : `${lead}: ${detail}`

/**
 * Classifies a failure from the agent (or anything thrown around it) into a
 * {@link ReactorError}, following one table. `mayHaveExecuted` is `true`
 * exactly when the failure leaves open that the canister ran the call.
 *
 * | Failure | kind (update / query) | mayHaveExecuted (update / query) |
 * | --- | --- | --- |
 * | already a ReactorError | unchanged | unchanged |
 * | `AbortError`, or the signal aborted | `cancelled` | true / false |
 * | reject 1 or 3 | `rejected` | false / false |
 * | reject 2 | `not_delivered`, retryable | false / false |
 * | reject 1, 2 or 3 from `aaaaa-aa` | `rejected` | true / false |
 * | reject 4 or 5 | `rejected` | true / false |
 * | reject 6, an unknown code, HTTP 408 or 5xx, a network failure, a polling timeout, a `Trust` failure | `outcome_unknown` / `not_delivered`, retryable for a query | true / false |
 * | HTTP 429 | `not_delivered`, retryable | false / false |
 * | any other HTTP 4xx, `IngressExpiryInvalid` | `not_delivered` | false / false |
 *
 * For a query nothing that matters executes, so every doubt is `not_delivered`
 * and `mayHaveExecuted` is `false`. The HTTP rows, and `IngressExpiryInvalid`,
 * assume the failure came before the replica accepted the request; see
 * {@link ErrorContext.accepted}.
 *
 * An abort during an update is `cancelled` with `mayHaveExecuted: true`: the
 * request may already have been delivered. Use
 * `createReactorError("cancelled", ...)` for a refusal before anything was
 * sent, which says `false`.
 *
 * An error that is already a ReactorError comes back as the same object, so
 * it may carry an `err` that the return type does not promise.
 *
 * The thrown error becomes the result's `cause`, and the result's `message`
 * is one short line (`[ic-reactor] <method> on <canisterId>: <reason>`): a
 * missing canister arrives from the agent as an HTTP 400 whose own message
 * runs to thousands of characters.
 */
export function classifyError(
  error: unknown,
  context: ErrorContext
): ReactorError {
  if (isReactorError(error)) return error as unknown as ReactorError
  const { method, canisterId } = context
  const update = context.mode === "update"
  const shape = readShape(error)
  const { rejectCode, httpStatus } = shape

  const make = (
    kind: ReactorErrorKind,
    mayHaveExecuted: boolean,
    reason: string,
    retryable = false
  ): ReactorError =>
    build({
      kind,
      mayHaveExecuted,
      reason,
      retryable,
      method,
      canisterId,
      rejectCode,
      httpStatus,
      cause: error,
    })

  if (context.signal?.aborted || isAbort(error)) {
    return make("cancelled", update, DEFAULT_REASON.cancelled)
  }

  // An agent error has a `kind`. One without (a bug, or some other agent) is
  // classified the same way but never retried: nothing says another attempt
  // would end differently.
  const agentShaped =
    shape.kind !== undefined ||
    rejectCode !== undefined ||
    httpStatus !== undefined

  // A query executes nothing that matters, so every doubt is "not delivered".
  const doubt = (reason: string): ReactorError =>
    update
      ? make("outcome_unknown", true, reason)
      : make("not_delivered", false, reason, agentShaped)

  if (shape.kind === "Reject" || rejectCode !== undefined) {
    const name = rejectCode === undefined ? undefined : REJECT_NAMES[rejectCode]
    const reason = withDetail(
      `the IC rejected the call${
        rejectCode === undefined
          ? ""
          : ` with code ${rejectCode}${name === undefined ? "" : ` (${name})`}`
      }`,
      shape.detail
    )
    // aaaaa-aa is exempt from the "no canister code ran" reading of 1, 2 and 3.
    const noCodeRan = canisterId !== MANAGEMENT_CANISTER
    if (rejectCode === SYS_TRANSIENT && noCodeRan) {
      return make("not_delivered", false, reason, true)
    }
    if (
      rejectCode === SYS_TRANSIENT ||
      rejectCode === SYS_FATAL ||
      rejectCode === DESTINATION_INVALID
    ) {
      return make("rejected", !noCodeRan && update, reason)
    }
    if (rejectCode === 4 || rejectCode === 5) {
      return make("rejected", update, reason)
    }
    // 6, a code outside 1 to 6, or a rejection whose code cannot be read.
    return doubt(reason)
  }

  if (shape.codeName === "IngressExpiryInvalidErrorCode") {
    const reason = withDetail(
      "the replica refused the request's ingress expiry",
      shape.detail
    )
    return update && context.accepted
      ? make("outcome_unknown", true, reason)
      : make("not_delivered", false, reason)
  }

  if (httpStatus !== undefined) {
    const reason = withDetail(
      `the replica answered HTTP ${httpStatus}${
        shape.statusText === "" ? "" : ` ${shape.statusText}`
      }`,
      shape.detail
    )
    // A 429 or a 4xx is the replica or a boundary node refusing the request
    // itself (rate limit, bad signature, expired delegation, no such
    // canister): the canister never saw it. 408 is the exception, a timeout
    // after the request may have been passed on. 5xx may follow a delivery.
    const refused = httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408
    if (!refused || (update && context.accepted)) return doubt(reason)
    return make("not_delivered", false, reason, httpStatus === 429)
  }

  // Transport, Protocol, Trust, External, Limit, Unknown, a polling timeout,
  // and anything that is not an agent error at all.
  const lead =
    shape.kind === "Transport"
      ? "could not reach the replica"
      : shape.kind === "Trust"
        ? "the replica's answer could not be verified"
        : "the call failed"
  return doubt(withDetail(lead, shape.detail || "unknown error"))
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

const isRetryable = (error: unknown): boolean =>
  isReactorError(error) &&
  error.kind === "not_delivered" &&
  (error as unknown as Record<symbol, unknown>)[RETRYABLE] === true

/**
 * How long to wait before each re-send of an update: 300 ms, then 600 ms.
 * Its length is the most re-sends one call gets.
 */
export const UPDATE_RESEND_DELAYS_MS: readonly [300, 600] = [300, 600]

/**
 * Whether an update may be sent again. Every attempt at an update is a new
 * request id, so the IC cannot tell a retry from a second call and runs both.
 * A re-send is safe only when the failure proves the first attempt was never
 * accepted, and only two do: a SysTransient reject (code 2, from anything but
 * the management canister) and an HTTP 429. Any other failure, a network
 * error included, may have come after the replica accepted the call.
 *
 * `resendsSoFar` is how many times this call has been re-sent already; the
 * answer is `false` once it reaches the length of
 * {@link UPDATE_RESEND_DELAYS_MS}.
 */
export function retryUpdate(error: unknown, resendsSoFar: number): boolean {
  if (resendsSoFar >= UPDATE_RESEND_DELAYS_MS.length) return false
  return (
    isRetryable(error) &&
    isReactorError(error) &&
    !error.mayHaveExecuted &&
    (error.rejectCode === SYS_TRANSIENT || error.httpStatus === 429)
  )
}

/**
 * A TanStack Query `retry` for a query: at most 3 retries, and only of a
 * failure the classifier marked as safe to try again (a `not_delivered` that a
 * later attempt can change). Never on a server: TanStack defaults to no
 * retries there, and supplying a predicate would override that and add the
 * 1s/2s/4s backoff to a request that used to fail fast.
 *
 * `failureCount` is how many failures there have been before this one, as
 * TanStack passes it (0 after the first failure).
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (isServer()) return false
  return failureCount < 3 && isRetryable(error)
}
