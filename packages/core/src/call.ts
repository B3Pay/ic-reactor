/**
 * The one call path every canister call takes: a direct call on a canister
 * object, a read's query function, a mutation's function and a func
 * reference's function all end in {@link invoke}.
 *
 * In order, nothing sent until the last step:
 *
 * 1. the client: every call on a disposed client rejects `cancelled`
 *    (`client_disposed`), whatever else is wrong with it. This comes first
 *    because a disposed client calls as the anonymous principal, so the
 *    caller check below would refuse a write as `unauthenticated`;
 * 2. the target: an unresolved `{ name }` rejects `invalid_args`
 *    (`canister_id_unresolved`); a composite query on a certified canister
 *    rejects `invalid_args` (`no_certified_path`);
 * 3. the caller: an update or a oneway by a caller who is not signed in
 *    rejects `unauthenticated` (`anonymous_write`);
 * 4. the arguments: Candid-encoded with the method's schemas, or
 *    `invalid_args` with the codec's `$`-rooted issues; a call to `aaaaa-aa`
 *    also needs a row of the effective canister id table (`management.ts`).
 *    A mutation that re-sends a write `client.resendOf()` offered must be
 *    that write: the same method, canister id and bytes, or it is refused
 *    (`target_changed`, `arg_changed`). A re-send refused at any step, or
 *    turned away when sent, rejects `outcome_unknown` with the refusal's
 *    code instead, since the write it re-sends may have run (see
 *    {@link invoke});
 * 5. the send, as the caller's own agent: `agent.query` for a read,
 *    `agent.call` for an update, a oneway and a certified read. Every failure
 *    is classified (`classifyError`), and a call re-sends itself only when
 *    the classified failure allows it (see {@link CallRequest.resend}). The
 *    agent is asked for before every attempt, and a client disposed since
 *    the first step cancels the attempt (`ClientInternals.agentFor`);
 * 6. the reply: decoded with the method's result schemas (`invalid_reply` if
 *    it does not decode), collapsed as the generator types it (0 results:
 *    `undefined`, 1: the value, n: the tuple), and unwrapped when the one
 *    result is an `Ok`/`Err` variant (`canister_err` with the `Err` payload).
 *
 * ## Why updates use `agent.call`, not `agent.update` (a recorded design call)
 *
 * DECISIONS Q8 chose `agent.update()`. The client builds its agents with
 * `retryTimes: 0` (see `ClientInternals.agentFor`), so one failed `read_state`
 * while `agent.update()` polls for a slow update ends the call as
 * `outcome_unknown`, and `agent.update()` keeps the request id to itself, so
 * nothing can poll again. This path sends with `agent.call()`, reads the
 * response the way `agent.update()` does in `@icp-sdk/core` 6.1 (a certified
 * v4 reply, an uncertified v2 reject, or 202 and then polling), and polls the
 * same request id with `pollForResponse`. A transient polling failure (a lost
 * connection, HTTP 408, 429 or 5xx) is followed by another poll of the same
 * request id, at most {@link REPOLL_DELAYS_MS} times: `read_state` executes
 * nothing, so asking again can never run the update twice. It also tells the
 * classifier exactly when the request may have got in (`accepted`): only after
 * `agent.call()` returned.
 *
 * Internal: not exported from the package entry.
 *
 * @module
 */
import {
  resolveSchema,
  type AnyFieldSchema,
  type MethodMode,
  type ServiceMethod,
} from "@candid-core/schema"
import {
  decodeArgs,
  encodeArgs,
  type EncodeResult,
} from "@candid-core/schema/codec"
import { isResultSchema } from "@candid-core/schema/validate"
import {
  Certificate,
  CertifiedRejectErrorCode,
  Expiry,
  QueryResponseStatus,
  RejectError,
  UncertifiedRejectErrorCode,
  UncertifiedRejectUpdateErrorCode,
  UnexpectedErrorCode,
  UnknownError,
  defaultStrategy,
  isV2ResponseBody,
  isV4ResponseBody,
  lookupResultToBuffer,
  pollForResponse,
  type HttpAgent,
  type PollStrategy,
  type ReplicaRejectCode,
  type RequestId,
  type SubmitResponse,
} from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import type { Caller, ClientInternals } from "./client.js"
import {
  UPDATE_RESEND_DELAYS_MS,
  classifyError,
  createReactorError,
  fromCanister,
  withExpiry,
  invalidReplyError,
  isReactorError,
  isRetryable,
  resendDidNotRun,
  retryUpdate,
  timedOutError,
  type CallMode,
  type ReactorError,
} from "./errors.js"
import { toHex } from "./keys.js"
import {
  MANAGEMENT_CANISTER,
  effectiveCanisterId,
  isRoutable,
} from "./management.js"

/**
 * How long to wait before each extra poll of an update whose `read_state`
 * failed for a transient reason. Its length is the most extra polls one call
 * gets; the agent's own polling strategy (five minutes in all) still bounds
 * the whole wait.
 */
export const REPOLL_DELAYS_MS: readonly number[] = [500, 1_000, 2_000]

/** A method of a service or a func reference, read once. */
export interface PreparedMethod {
  readonly name: string
  readonly mode: MethodMode
  readonly args: readonly AnyFieldSchema[]
  readonly results: readonly AnyFieldSchema[]
  /** The tags of the one result when it is an `Ok`/`Err` variant, else absent. */
  readonly result?: { readonly ok: string; readonly err: string }
}

/**
 * Reads what a call needs of a method once: whether its one result is a
 * result variant (the rule of `isResultSchema`) and how its arms are spelled.
 */
export function prepareMethod(method: ServiceMethod): PreparedMethod {
  const { name, mode, args, results } = method
  if (results.length !== 1 || !isResultSchema(results[0])) {
    return { name, mode, args, results }
  }
  const node = resolveSchema(results[0])
  const arms = node.kind === "variant" ? node.arms : {}
  return {
    name,
    mode,
    args,
    results,
    result: "Ok" in arms ? { ok: "Ok", err: "Err" } : { ok: "ok", err: "err" },
  }
}

/** Whether a method changes state: an update or a oneway. */
export const isWrite = (mode: MethodMode): boolean =>
  mode === "update" || mode === "oneway"

/**
 * The argument list for `vars`, the builders' argument convention (DECISIONS
 * Q3): nothing, the one value, or the tuple. Anything else is passed on as it
 * is, for the codec to refuse with an issue that says what it got.
 */
export function valuesOf(
  method: PreparedMethod,
  vars: unknown
): readonly unknown[] {
  const arity = method.args.length
  if (arity === 1) return [vars]
  if (arity === 0 && vars === undefined) return []
  return Array.isArray(vars) ? vars : [vars]
}

/** The `invalid_args` of arguments that do not encode, with the codec's issues. */
export function notEncoded(
  where: { readonly method: string; readonly canisterId: string },
  encoded: Extract<EncodeResult, { ok: false }>
): ReactorError {
  const [first] = encoded.issues
  return createReactorError("invalid_args", {
    ...where,
    reason: first
      ? `the arguments could not be encoded: ${first.path}: ${first.message}`
      : undefined,
    issues: encoded.issues,
  })
}

/** Where a call goes: a canister id, or the key segment of an unresolved name and why. */
export type ResolvedTarget =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly slot: string; readonly message: string }

/** One call. */
export interface CallRequest {
  readonly method: PreparedMethod
  readonly target: ResolvedTarget
  /** Whether the canister is certified: its `query` methods go out as replicated calls. */
  readonly certified: boolean
  /**
   * Who calls: the caller current when a direct call or a mutation runs, or
   * the one captured with a read's key.
   */
  readonly caller: Caller
  /** The arguments, as a list. */
  readonly values: readonly unknown[]
  /**
   * Their encoding: made by the builder for the key, or by `run` when it
   * encodes them, which sets it here. A write kept in {@link UNKNOWN_WRITES}
   * therefore holds the bytes it sent, and `client.resendOf()` sends those
   * again, whatever became of the argument objects since.
   */
  encoded?: EncodeResult
  /**
   * The effective canister id a call to `aaaaa-aa` is routed by: derived from
   * the arguments by `run` the first time, which sets it here, so a kept
   * write is routed where its bytes went, as {@link encoded} is.
   */
  effective?: string
  /**
   * The write this call sends again: set by a mutation given an argument
   * `client.resendOf()` offered. The call is refused, and nothing sent,
   * unless it is that write ({@link differs}).
   */
  readonly again?: CallRequest
  /**
   * On a write no other re-sends ({@link firstOf}), set by `invoke`: the
   * latest `expiresAt` of the errors it and its re-sends were kept in
   * {@link UNKNOWN_WRITES} with. Until then a send of it may still start, so
   * a re-send of it that did not run carries it on ({@link keptUnknown}).
   */
  expiresAt?: bigint
  /**
   * The signal of a query function. Once it aborts, the call is not sent, or
   * stops waiting for the HTTP answer to its request or polling for its
   * answer, and rejects `cancelled`.
   */
  readonly signal?: AbortSignal
  /**
   * How long the caller waits, from the start of the call to its answer: a
   * direct call's `timeoutMs` (on its canister target), or a mutation's.
   * When it passes, the call stops waiting as if {@link signal} had aborted,
   * and rejects with code `"timeout"`: `cancelled` with nothing executed,
   * except while an attempt of an update (or a oneway) is out, which may
   * have been delivered, and for a re-send of an offered write ({@link again})
   * at any point, whose earlier attempt may have run: `outcome_unknown` with
   * `mayHaveExecuted: true`, the same as the polling bound. Nothing is ever sent again for it: the
   * re-sends of {@link resend} only follow a failure that proves the attempt
   * was not delivered, and the wait before one is a wait of this call.
   */
  readonly timeoutMs?: number
  /**
   * Whether this call re-sends itself after a failure that allows it: `true`
   * for a direct call and a mutation, `false` for a query function, whose
   * retries are TanStack's (`retry`), which knows about focus, network and
   * unmounting.
   *
   * An update (or oneway) is re-sent only when `retryUpdate` says so: reject
   * code 2 or HTTP 429 before the request got in, at most twice. A call to
   * `aaaaa-aa` is never re-sent: its reject codes prove nothing about what ran
   * (see `classifyError`), so its every outcome is left to the app. A read is
   * re-sent after any failure the classifier marks retryable, at most twice.
   */
  readonly resend: boolean
  /**
   * The canister object the call is made on, absent for a func reference.
   * Every error the call rejects with is marked with it (`fromCanister`), so
   * that `isReactorError(error, canister, method)` can tell its own call's
   * errors from any other's.
   */
  readonly canister?: object
}

/**
 * The request of each write that failed with `mayHaveExecuted: true`, by the
 * error it rejected with: what `client.resendOf()` offers to send again, as
 * the same caller, to the same canister, with the same arguments.
 */
export const UNKNOWN_WRITES = new WeakMap<object, CallRequest>()

/**
 * What makes a call of `method` to `target` with `encoded` arguments another
 * write than `sent`, a write that went out: `"target"` for another method or
 * canister id (a `{ name }` the `ic_env` cookie now maps elsewhere),
 * `"arg"` for other bytes (an argument changed after it was sent), and
 * `undefined` when it is the same write. A re-send of another write is a new
 * write that no dedupe key has been seen for.
 */
export const differs = (
  sent: CallRequest,
  method: PreparedMethod,
  target: ResolvedTarget,
  encoded: EncodeResult
): "target" | "arg" | undefined =>
  method.name !== sent.method.name ||
  !target.ok ||
  target.id !== (sent.target as { id: string }).id
    ? "target"
    : !encoded.ok ||
        toHex(encoded.bytes) !==
          toHex((sent.encoded as { bytes: Uint8Array }).bytes)
      ? "arg"
      : undefined

/** The write `request` re-sends, at the end of a chain of re-sends, or `request` itself. */
const firstOf = (request: CallRequest): CallRequest =>
  request.again === undefined ? request : firstOf(request.again)

/**
 * The error of a re-send of `again` that did not run, `failure` proving only
 * that: `outcome_unknown` ({@link resendDidNotRun}), since an earlier send of
 * the write may have run, kept as `again` in {@link UNKNOWN_WRITES}, so that
 * `client.resendOf()` offers that write again.
 */
export const keptUnknown = (
  again: CallRequest,
  failure: ReactorError | ReactorError<unknown>
): ReactorError => {
  const kept = resendDidNotRun(failure, firstOf(again).expiresAt)
  UNKNOWN_WRITES.set(kept, again)
  return kept
}

/**
 * Runs one call through the steps of this module. Resolves with the reply as
 * the generated `Actor` types it (unwrapped), and rejects with a
 * `ReactorError`, marked with the request's canister when it has one. A write
 * whose outcome is unknown is kept in {@link UNKNOWN_WRITES}.
 *
 * A re-send of an offered write ({@link CallRequest.again}) that did not run,
 * and that the canister did not answer, rejects {@link keptUnknown}.
 */
export const invoke = (
  internals: ClientInternals,
  request: CallRequest
): Promise<unknown> =>
  run(internals, request).catch((error: unknown) => {
    const again = request.again
    if (
      again !== undefined &&
      isReactorError(error) &&
      !error.mayHaveExecuted &&
      error.kind !== "canister_err"
    ) {
      throw fromCanister(keptUnknown(again, error), request.canister)
    }
    if (
      isReactorError(error) &&
      error.mayHaveExecuted &&
      isWrite(request.method.mode)
    ) {
      UNKNOWN_WRITES.set(error, request)
      // Each send of the write may start until its own expiry, so the write
      // it re-sends keeps the latest.
      const first = firstOf(request)
      if (
        first.expiresAt === undefined ||
        (error.expiresAt ?? 0n) > first.expiresAt
      ) {
        first.expiresAt = error.expiresAt
      }
    }
    throw fromCanister(error, request.canister)
  })

async function run(
  internals: ClientInternals,
  request: CallRequest
): Promise<unknown> {
  const { method, target, caller } = request
  const name = method.name
  if (internals.disposed()) {
    throw createReactorError("cancelled", {
      method: name,
      canisterId: target.ok ? target.id : target.slot,
      code: "client_disposed",
      reason: "the call was made on a disposed client; nothing was sent",
    })
  }
  if (!target.ok) {
    throw createReactorError("invalid_args", {
      method: name,
      canisterId: target.slot,
      code: "canister_id_unresolved",
      reason: target.message,
    })
  }
  const where = { method: name, canisterId: target.id }
  if (request.certified && method.mode === "composite_query") {
    throw createReactorError("invalid_args", {
      ...where,
      code: "no_certified_path",
      reason:
        "a composite query has no certified path; call it on the canister made without certified: true",
    })
  }
  const write = isWrite(method.mode)
  if (write && !caller.authenticated) {
    throw createReactorError("unauthenticated", {
      ...where,
      code: "anonymous_write",
      reason: `${method.mode === "oneway" ? "a oneway" : "an update"} needs a signed-in caller, and the caller is ${caller.principal}; nothing was sent`,
    })
  }
  const management = target.id === MANAGEMENT_CANISTER
  if (management && !isRoutable(name)) {
    throw unroutable(where, effectiveCanisterId(name, request.values))
  }
  const encoded = (request.encoded ??= encodeArgs(method.args, request.values))
  if (!encoded.ok) throw notEncoded(where, encoded)
  // A re-send of an offered write goes out only as that write: anything else
  // would be a new write, which the canister has seen no dedupe key for.
  const sent = request.again
  if (sent) {
    const change = differs(sent, method, target, encoded)
    if (change) {
      throw createReactorError(
        change === "arg" ? "invalid_args" : "cancelled",
        {
          ...where,
          code: `${change}_changed`,
          reason:
            change === "arg"
              ? "the argument was changed after the write it re-sends went out; it was not sent"
              : `the write it re-sends went to ${sent.method.name} on ${(sent.target as { id: string }).id}; it was not sent`,
        }
      )
    }
  }
  if (management && !request.effective) {
    const routed = effectiveCanisterId(name, request.values)
    if (!routed.ok) throw unroutable(where, routed)
    request.effective = routed.id
  }

  const mode: CallMode = write ? "update" : "query"
  const send: Send =
    method.mode === "oneway"
      ? "oneway"
      : write || (request.certified && method.mode === "query")
        ? "replicated"
        : "query"
  const call: Outgoing = {
    canisterId: target.id,
    effective: request.effective ?? target.id,
    methodName: name,
    // A copy per invocation: the bytes are what `watchSends` knows this
    // invocation's sends by, and a `resendOf` offer or a cached encoding
    // hands the same bytes to every invocation.
    arg: encoded.bytes.slice(),
    mode,
    signal: request.signal,
  }

  // A timeout aborts a signal of its own, which the query function's signal
  // (when there is one) aborts too, so every wait below ends at either.
  const ms = request.timeoutMs
  const outer = request.signal
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  // Whether an attempt is out, and may be in the IC: from the moment it is
  // handed to the agent until it fails. A failure that lets the call re-send
  // proves the attempt was not delivered, so a timeout during the wait
  // before a re-send finds nothing out.
  let out = false
  let end: (() => void) | undefined
  if (ms !== undefined) {
    const stop = new AbortController()
    end = () => stop.abort(outer?.reason)
    call.signal = stop.signal
    outer?.addEventListener("abort", end, { once: true })
    if (outer?.aborted) end()
    timer = setTimeout(() => {
      timedOut = !stop.signal.aborted
      stop.abort()
    }, ms)
  }
  const signal = call.signal

  let reply: Uint8Array | undefined
  // The latest ingress expiry among this call's sends, for a write that ends
  // with no answer (`expiresAt`).
  const sends: Sent = {}
  try {
    for (let resends = 0; ; resends += 1) {
      try {
        if (resends > 0) {
          await untilAborted(
            sleep(UPDATE_RESEND_DELAYS_MS[resends - 1]),
            signal
          )
        }
        // Asked again before every attempt: a re-send for a caller who is no
        // longer current is cancelled, not sent as them.
        const agent = await untilAborted(
          internals.agentFor(caller.principal, where),
          signal
        )
        if (signal?.aborted) throw notSent(where, "the call was cancelled")
        // agentFor checked for disposal before it returned the agent, but a
        // dispose() can still run in the microtask between that check and
        // this line (a reaction on the identity's promise, say): nothing is
        // sent then.
        if (internals.disposed()) {
          throw notSent(where, "the client was disposed", "client_disposed")
        }
        out = true
        reply = await dispatch(agent, send, call, sends)
        break
      } catch (error) {
        // Never a re-send: what the attempt out did is unknown, and the
        // caller has stopped waiting. A re-send of an offered write that
        // times out before it goes out keeps the earlier attempt's unknown
        // outcome all the same (`invoke`).
        if (timedOut) {
          throw withExpiry(timedOutError(where, write && out), sends.expiresAt)
        }
        out = false
        if (signal?.aborted && !isReactorError(error)) {
          throw notSent(where, "the call was cancelled")
        }
        const resend =
          request.resend &&
          (write
            ? !management && retryUpdate(error, resends)
            : resends < UPDATE_RESEND_DELAYS_MS.length && isRetryable(error))
        if (!resend) throw write ? withExpiry(error, sends.expiresAt) : error
      }
    }
  } finally {
    clearTimeout(timer)
    if (end) outer?.removeEventListener("abort", end)
  }
  if (send === "oneway") return undefined
  return decodeReply(method, reply as Uint8Array, internals, {
    ...where,
    mode,
  })
}

const unroutable = (
  where: { method: string; canisterId: string },
  routed:
    { readonly ok: false; readonly reason: string } | { readonly ok: true }
) =>
  createReactorError("invalid_args", {
    ...where,
    code: "effective_canister_id_unknown",
    reason: routed.ok ? "the call cannot be routed" : routed.reason,
  })

/** A refusal before the call's next attempt went out. */
const notSent = (
  where: { method: string; canisterId: string },
  lead: string,
  code?: string
) =>
  createReactorError("cancelled", {
    ...where,
    code,
    reason: `${lead} before it was sent`,
  })

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** How a call goes out. */
type Send = "query" | "replicated" | "oneway"

interface Outgoing {
  readonly canisterId: string
  /** The canister the request is routed by: `canisterId`, or for `aaaaa-aa` the one its table names. */
  readonly effective: string
  readonly methodName: string
  readonly arg: Uint8Array
  /** How a failure is classified: `update` for a write, `query` for a read (certified or not). */
  readonly mode: CallMode
  /** The call's signal: the query function's, or the timeout's when there is one. */
  signal?: AbortSignal
}

/** What the sends of one call record: the latest ingress expiry they were signed with. */
interface Sent {
  expiresAt?: bigint
}

/** Records the ingress expiry a send was signed with, keeping the latest. */
function recordExpiry(sent: Sent, expiry: unknown): void {
  if (!Expiry.isExpiry(expiry)) return
  const value = expiry.toBigInt()
  if (sent.expiresAt === undefined || value > sent.expiresAt) {
    sent.expiresAt = value
  }
}

/**
 * The writes being sent, by the encoded argument the agent puts into their
 * call requests, for {@link watchSends}.
 */
const signing = new WeakMap<
  Uint8Array,
  { readonly sent: Sent; readonly signal?: AbortSignal }
>()
const watched = new WeakSet<HttpAgent>()

/**
 * Has `agent` record the ingress expiry of every call request of a write in
 * its `Sent` while it builds the request, before it is signed and sent: a
 * signal that aborts while the answer is awaited cannot lose it. A request
 * whose signal aborted before then is refused, so it is never sent: every
 * send of a write that may have gone out is recorded.
 */
function watchSends(agent: HttpAgent): void {
  if (watched.has(agent)) return
  watched.add(agent)
  agent.addTransform("update", async (request) => {
    const body = request.body as { arg?: Uint8Array; ingress_expiry?: unknown }
    const write = body.arg && signing.get(body.arg)
    if (!write) return
    if (write.signal?.aborted) throw abortReason(write.signal)
    recordExpiry(write.sent, body.ingress_expiry)
  })
}

/**
 * Sends one attempt and returns the reply bytes (`undefined` for a oneway).
 * Rejects with the classified failure. The ingress expiry of a call request
 * is recorded in `sent` as the agent builds it ({@link watchSends}).
 */
async function dispatch(
  agent: HttpAgent,
  send: Send,
  call: Outgoing,
  sent: Sent
): Promise<Uint8Array | undefined> {
  const effectiveTarget = { canisterId: call.effective }
  // Whether the request may be in the IC: only once `agent.call` returned,
  // which it does for a 200 or a 202. Until then every failure is the request
  // being refused or lost on its way in, which the classifier reads from the
  // failure itself.
  let accepted = false
  try {
    // Neither the agent nor the `fetch` it was given bounds the wait for an
    // HTTP answer, and the agent passes `fetch` no signal: the wait is ended
    // here when the signal aborts. The request itself is not torn down, but
    // nobody waits for its answer.
    if (send === "query") {
      const response = await untilAborted(
        agent.query(call.canisterId, {
          methodName: call.methodName,
          arg: call.arg,
          effectiveTarget,
        }),
        call.signal
      )
      if (response.status === QueryResponseStatus.Rejected) {
        throw RejectError.fromCode(
          new UncertifiedRejectErrorCode(
            response.requestId,
            response.reject_code,
            response.reject_message,
            response.error_code,
            response.signatures
          )
        )
      }
      return response.reply.arg
    }
    watchSends(agent)
    signing.set(call.arg, { sent, signal: call.signal })
    const submitted = await untilAborted(
      agent.call(call.canisterId, {
        methodName: call.methodName,
        arg: call.arg,
        effectiveTarget,
        // A oneway expects no reply, so it is sent asynchronously and settles
        // once the IC has accepted it.
        ...(send === "oneway" ? { callSync: false } : {}),
      }),
      call.signal
    )
    accepted = true
    const { body } = submitted.response
    if (isV2ResponseBody(body)) {
      throw RejectError.fromCode(
        new UncertifiedRejectUpdateErrorCode(
          submitted.requestId,
          body.reject_code,
          body.reject_message,
          body.error_code
        )
      )
    }
    if (send === "oneway") return undefined
    return await settle(agent, submitted, call)
  } catch (error) {
    throw classifyError(
      error,
      call.mode === "update"
        ? {
            method: call.methodName,
            canisterId: call.canisterId,
            mode: "update",
            accepted,
            signal: call.signal,
          }
        : {
            method: call.methodName,
            canisterId: call.canisterId,
            mode: "query",
            signal: call.signal,
          }
    )
  }
}

const utf8 = new TextEncoder()
const text = new TextDecoder()

/**
 * The reply of a submitted call, as `agent.update()` reads it in
 * `@icp-sdk/core` 6.1: from the certificate of a synchronous (v4) answer, and
 * by polling `read_state` after a 202 or a certificate that has no status for
 * the request yet.
 */
async function settle(
  agent: HttpAgent,
  { requestId, response }: SubmitResponse,
  call: Outgoing
): Promise<Uint8Array> {
  const { body } = response
  if (isV4ResponseBody(body)) {
    const reply = await untilAborted(
      readCertificate(agent, body.certificate, call.effective, requestId),
      call.signal
    )
    if (reply !== undefined) return reply
  } else if (response.status !== 202) {
    throw UnknownError.fromCode(
      new UnexpectedErrorCode(
        `the replica answered a call with HTTP ${response.status} and no body to read`
      )
    )
  }
  return poll(agent, call.effective, requestId, call.signal)
}

/**
 * Verifies a v4 call answer's certificate and reads the request's status in
 * it: the reply, a certified reject (thrown), or `undefined` when the
 * certificate has no status for the request yet and it must be polled.
 */
async function readCertificate(
  agent: HttpAgent,
  raw: Uint8Array,
  effective: string,
  requestId: RequestId
): Promise<Uint8Array | undefined> {
  const rootKey = agent.rootKey
  if (rootKey === null) {
    throw new Error("the agent has no root key to verify the reply with")
  }
  const certificate = await Certificate.create({
    certificate: raw,
    rootKey,
    principal: { canisterId: Principal.fromText(effective) },
    agent,
  })
  const path = [utf8.encode("request_status"), requestId]
  const read = (leaf: string) =>
    lookupResultToBuffer(certificate.lookup_path([...path, utf8.encode(leaf)]))
  const status = read("status")
  if (status === undefined) return undefined
  switch (text.decode(status)) {
    case "replied": {
      const reply = read("reply")
      if (reply === undefined) {
        throw new Error("the certificate says replied but holds no reply")
      }
      return reply
    }
    case "rejected": {
      const errorCode = read("error_code")
      throw RejectError.fromCode(
        new CertifiedRejectErrorCode(
          requestId,
          (read("reject_code")?.[0] ?? 0) as ReplicaRejectCode,
          text.decode(read("reject_message") ?? new Uint8Array()),
          errorCode === undefined ? undefined : text.decode(errorCode)
        )
      )
    }
    default:
      throw UnknownError.fromCode(
        new UnexpectedErrorCode(
          `unexpected request status "${text.decode(status)}" in a call's certificate`
        )
      )
  }
}

/** Whether a failed `read_state` is worth asking again: the request may simply not have arrived. */
function isTransientPollFailure(error: unknown): boolean {
  const record = (
    typeof error === "object" && error !== null ? error : {}
  ) as Record<string, unknown>
  if (record.kind === "Transport") return true
  const code = (
    typeof record.code === "object" && record.code !== null ? record.code : {}
  ) as Record<string, unknown>
  const status = code.name === "HttpErrorCode" ? code.status : undefined
  return (
    typeof status === "number" &&
    (status === 408 || status === 429 || status >= 500)
  )
}

/**
 * `promise`, or a rejection with the signal's reason as soon as `signal`
 * aborts, whichever comes first. What `promise` was waiting for goes on, but
 * nobody waits for it.
 */
function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (signal === undefined) return promise
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal))
    // The promise is handled even when the signal has already aborted, so a
    // request that fails after nobody waits for it is not an unhandled
    // rejection.
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      }
    )
  })
}

/** What an aborted signal is thrown as. The classifier reads the signal, so any value does. */
const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new Error("the call was cancelled")

/**
 * Polls `read_state` for the request's reply, asking again after a transient
 * failure, at most {@link REPOLL_DELAYS_MS} times.
 *
 * It stops, and rejects, as soon as `signal` aborts: before each poll,
 * while a poll waits for its answer, and during every wait between two. A read whose observer went away (TanStack
 * aborts the signal it gave the query function) would otherwise keep asking
 * for up to the strategy's five minutes, for an answer nobody reads.
 */
async function poll(
  agent: HttpAgent,
  effective: string,
  requestId: RequestId,
  signal: AbortSignal | undefined
): Promise<Uint8Array> {
  // One strategy for every poll, so its five-minute bound covers them all.
  const waits = defaultStrategy()
  const strategy: PollStrategy = (...args) =>
    untilAborted(waits(...args), signal)
  for (let failures = 0; ; failures += 1) {
    if (signal?.aborted === true) throw abortReason(signal)
    try {
      // Each poll's own read_state request has no bound either: an abort
      // ends the wait for its answer too.
      const { reply } = await untilAborted(
        pollForResponse(agent, { canisterId: effective }, requestId, {
          strategy,
        }),
        signal
      )
      return reply
    } catch (error) {
      if (
        failures >= REPOLL_DELAYS_MS.length ||
        !isTransientPollFailure(error)
      ) {
        throw error
      }
      // An abort ends the wait at once, and the check above ends the loop.
      await untilAborted(sleep(REPOLL_DELAYS_MS[failures]), signal)
    }
  }
}

/** A short description of a decoded `Err` payload, for the error message. */
function describeErr(errTag: string, payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { tag?: unknown }).tag === "string"
  ) {
    return `${errTag} ${(payload as { tag: string }).tag}`
  }
  if (typeof payload === "string") {
    const line = payload.replace(/\s+/g, " ").trim()
    return `${errTag} ${JSON.stringify(line.length > 120 ? `${line.slice(0, 119)}…` : line)}`
  }
  return errTag
}

/**
 * Decodes, collapses and unwraps a reply. The codec returns `unknown[]`; what
 * it returns is checked against the method's schemas, and the generated
 * `Actor` type is the static description of the same thing, so the builders
 * cast the result to the `Actor`'s reply type once, where they hand it out.
 */
function decodeReply(
  method: PreparedMethod,
  reply: Uint8Array,
  limits: { readonly maxDepth: number; readonly maxElements: number },
  context: { method: string; canisterId: string; mode: CallMode }
): unknown {
  // candid-core charges a blob one element per byte, so a reply over its
  // default budget of 1,000,000 (a wasm module, an asset chunk) would never
  // decode. A reply may hold one value per byte plus the budget: that work is
  // bounded by the IC's reply size, and the budget still bounds values that
  // take no bytes on the wire, however large a blob beside them.
  const decoded = decodeArgs(method.results, reply, {
    maxDepth: limits.maxDepth,
    maxElements: Math.min(
      limits.maxElements + reply.length,
      Number.MAX_SAFE_INTEGER
    ),
  })
  if (!decoded.ok) {
    const [first] = decoded.issues
    throw invalidReplyError(context, {
      reason: first
        ? `the reply did not decode as the method's result: ${first.path}: ${first.message}`
        : undefined,
      issues: decoded.issues,
    })
  }
  const { values } = decoded
  const value =
    values.length === 0
      ? undefined
      : values.length === 1
        ? values[0]
        : [...values]
  if (method.result === undefined) return value
  // The decoder checked the value against the result variant, so it is one of
  // its two arms. An arm that carries nothing decodes without `value`: its
  // payload is Candid `null`, as `unwrapResult` reads it.
  const arm = value as { readonly tag: string; readonly value?: unknown }
  const payload = "value" in arm ? arm.value : null
  if (arm.tag === method.result.ok) return payload
  throw createReactorError("canister_err", {
    method: context.method,
    canisterId: context.canisterId,
    reason: `the canister returned ${describeErr(method.result.err, payload)}`,
    err: payload,
  })
}
