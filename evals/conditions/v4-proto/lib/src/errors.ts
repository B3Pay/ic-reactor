// One error type for every failure a handle reports, with one `kind` each.
// The kind says what happened; `mayHaveExecuted` says whether the canister
// may have run the call anyway, which is the question a UI has to answer
// after a failed write.

export type ReactorErrorKind =
  /** The arguments could not be encoded (or a principal text is invalid). Nothing was sent. */
  | "invalid_args"
  /** A write was attempted while not signed in. Nothing was sent. */
  | "unauthenticated"
  /** The request certainly did not reach the canister (refused, or SysTransient). Safe to retry. */
  | "not_delivered"
  /** An update may or may not have executed: the request went out and no trustworthy answer came back. */
  | "outcome_unknown"
  /**
   * The IC or the canister rejected the call; `.rejectCode` says which. For a
   * write, `mayHaveExecuted` is false only for the system rejects that run
   * no canister code (codes 1 and 3), true for rejects from the canister's
   * own code (4, 5) — see `classifyAgentError`.
   */
  | "rejected"
  /** A reply arrived but did not decode as the method's result type. */
  | "invalid_reply"
  /** The canister replied with the `Err` arm of an exactly-two-arm `Ok`/`Err` result. `.err` is typed. */
  | "canister_err"
  /** The request was abandoned by its caller (an aborted query). */
  | "cancelled"

const BRAND = Symbol.for("@ic-reactor/v4-proto/ReactorError")

interface ReactorErrorInit {
  readonly kind: ReactorErrorKind
  readonly message: string
  readonly method: string
  readonly canisterId: string
  readonly mayHaveExecuted: boolean
  readonly err?: unknown
  readonly rejectCode?: number
  readonly cause?: unknown
}

export class ReactorFailure extends Error {
  readonly kind: ReactorErrorKind
  readonly method: string
  readonly canisterId: string
  /** Whether the canister may have executed the call despite this failure. */
  readonly mayHaveExecuted: boolean
  /** The `Err` payload, for `kind === "canister_err"`; `undefined` otherwise. */
  readonly err: unknown
  /** The IC reject code, for `rejected` and for a SysTransient `not_delivered`. */
  readonly rejectCode: number | undefined
  override readonly cause: unknown

  constructor(init: ReactorErrorInit) {
    super(init.message)
    this.name = "ReactorError"
    this.kind = init.kind
    this.method = init.method
    this.canisterId = init.canisterId
    this.mayHaveExecuted = init.mayHaveExecuted
    this.err = init.err
    this.rejectCode = init.rejectCode
    this.cause = init.cause
    Object.defineProperty(this, BRAND, { value: true })
  }
}

type NonErrKind = Exclude<ReactorErrorKind, "canister_err">

/**
 * The error a handle throws. Narrow on `kind`: for `"canister_err"`, `err` is
 * the method's `Err` payload, typed `E`; for every other kind it is
 * `undefined`. `E` is `never` for a method whose result is not an `Ok`/`Err`
 * variant, so `"canister_err"` cannot occur for it.
 */
export type ReactorError<E = never> =
  | (ReactorFailure & { readonly kind: NonErrKind; readonly err: undefined })
  | ([E] extends [never]
      ? never
      : ReactorFailure & { readonly kind: "canister_err"; readonly err: E })

/** Whether `error` is a `ReactorError` (from any copy of this package). */
export function isReactorError(error: unknown): error is ReactorError<unknown> {
  return (
    error instanceof ReactorFailure ||
    (typeof error === "object" &&
      error !== null &&
      (error as Record<symbol, unknown>)[BRAND] === true)
  )
}

export function reactorError(init: ReactorErrorInit): ReactorFailure {
  return new ReactorFailure(init)
}

// ---------------------------------------------------------------------------
// Classifying what the agent (@icp-sdk/core 6) throws. Read structurally —
// `kind`, `code.name`, `code.rejectCode`, `code.status` — so an error from
// another copy of the agent classifies the same way.
// ---------------------------------------------------------------------------

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
//   this case)" with SYS_TRANSIENT, after its effect — so calls to aaaaa-aa
//   are not given this guarantee.
// - DESTINATION_INVALID (3): "Invalid destination (e.g. canister/account does
//   not exist)" — there was nothing to run.
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
// So: 1, 2, 3 → no effect (2 alone is also safe to re-send); 4, 5, 6 and any
// code not listed → may have executed.
const SYS_FATAL = 1
const SYS_TRANSIENT = 2
const DESTINATION_INVALID = 3
const SYS_UNKNOWN = 6
const MANAGEMENT_CANISTER = "aaaaa-aa"

interface AgentErrorShape {
  kind?: unknown
  code?: { name?: unknown; rejectCode?: unknown; status?: unknown }
  message?: unknown
}

export function classifyAgentError(
  error: unknown,
  context: { method: string; canisterId: string; update: boolean }
): ReactorFailure {
  if (isReactorError(error)) return error
  const { method, canisterId, update } = context
  const shape = (
    typeof error === "object" && error !== null ? error : {}
  ) as AgentErrorShape
  const message =
    typeof shape.message === "string" ? shape.message : String(error)
  const kind = typeof shape.kind === "string" ? shape.kind : undefined
  const make = (
    k: ReactorErrorKind,
    mayHaveExecuted: boolean,
    rejectCode?: number
  ) =>
    reactorError({
      kind: k,
      message: `${method}: ${k}: ${message.split("\n")[0]}`,
      method,
      canisterId,
      mayHaveExecuted,
      rejectCode,
      cause: error,
    })
  // For a query nothing executes that matters, so every doubt is "not delivered".
  const unknown = () =>
    update ? make("outcome_unknown", true) : make("not_delivered", false)

  const rejectCode =
    typeof shape.code?.rejectCode === "number"
      ? shape.code.rejectCode
      : undefined
  if (kind === "Reject" || rejectCode !== undefined) {
    const systemOnly = canisterId !== MANAGEMENT_CANISTER
    if (rejectCode === SYS_TRANSIENT && systemOnly) {
      return make("not_delivered", false, rejectCode)
    }
    if (
      (rejectCode === SYS_FATAL || rejectCode === DESTINATION_INVALID) &&
      systemOnly
    ) {
      return make("rejected", false, rejectCode)
    }
    if (rejectCode === SYS_UNKNOWN) return unknown()
    // The canister's own code ran (4, 5), or the code is not one we know.
    // A query's changes are always discarded, so only a write may have acted.
    return make("rejected", update, rejectCode)
  }
  const codeName =
    typeof shape.code?.name === "string" ? shape.code.name : undefined
  if (codeName === "HttpErrorCode" && typeof shape.code?.status === "number") {
    const status = shape.code.status
    // A 4xx is the replica or boundary refusing the request itself (bad
    // signature, expired delegation, rate limit): the canister never saw it.
    // 408 is the exception: a timeout after the request may have been passed on.
    if (status >= 400 && status < 500 && status !== 408)
      return make("not_delivered", false)
    return unknown()
  }
  if (kind === "Input" && codeName === "IngressExpiryInvalidErrorCode") {
    return make("not_delivered", false)
  }
  if (kind === "Trust" && !update) return make("invalid_reply", false)
  // Transport, Protocol, Trust (for an update), External, Limit, Unknown, and
  // anything that is not an agent error at all but surfaced after sending.
  return unknown()
}
