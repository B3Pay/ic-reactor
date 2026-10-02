/**
 * The one call path every canister call takes: a direct call on a canister
 * object, a read's query function, a mutation's function and a func
 * reference's function all end in {@link invoke}.
 *
 * In order, nothing sent until the last step:
 *
 * 1. the target: an unresolved `{ name }` rejects `invalid_args`
 *    (`canister_id_unresolved`); a composite query on a certified canister
 *    rejects `invalid_args` (`no_certified_path`);
 * 2. the caller: an update or a oneway by a caller who is not signed in
 *    rejects `unauthenticated` (`anonymous_write`);
 * 3. the arguments: Candid-encoded with the method's schemas, or
 *    `invalid_args` with the codec's `$`-rooted issues; a call to `aaaaa-aa`
 *    also needs a row of the effective canister id table (`management.ts`);
 * 4. the send, as the caller's own agent: `agent.query` for a read,
 *    `agent.call` for an update, a oneway and a certified read. Every failure
 *    is classified (`classifyError`), and a call re-sends itself only when
 *    the classified failure allows it (see {@link CallRequest.resend});
 * 5. the reply: decoded with the method's result schemas (`invalid_reply` if
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
  invalidReplyError,
  isRetryable,
  retryUpdate,
  type CallMode,
} from "./errors.js"
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
  /** Their encoding, when the builder already made it for the key. */
  readonly encoded?: EncodeResult
  /**
   * The signal of a query function. Once it aborts, the call is not sent, or
   * stops polling for its answer, and rejects `cancelled`.
   */
  readonly signal?: AbortSignal
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
}

/**
 * Runs one call through the steps of this module. Resolves with the reply as
 * the generated `Actor` types it (unwrapped), and rejects with a
 * `ReactorError`.
 */
export async function invoke(
  internals: ClientInternals,
  request: CallRequest
): Promise<unknown> {
  const { method, target, caller } = request
  const name = method.name
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
  const encoded = request.encoded ?? encodeArgs(method.args, request.values)
  if (!encoded.ok) {
    const [first] = encoded.issues
    throw createReactorError("invalid_args", {
      ...where,
      reason: first
        ? `the arguments could not be encoded: ${first.path}: ${first.message}`
        : undefined,
      issues: encoded.issues,
    })
  }
  let effective = target.id
  if (management) {
    const routed = effectiveCanisterId(name, request.values)
    if (!routed.ok) throw unroutable(where, routed)
    effective = routed.id
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
    effective,
    methodName: name,
    arg: encoded.bytes,
    mode,
    signal: request.signal,
  }

  let reply: Uint8Array | undefined
  for (let resends = 0; ; resends += 1) {
    try {
      if (request.signal?.aborted) {
        throw createReactorError("cancelled", {
          ...where,
          reason: "the read was cancelled before it was sent",
        })
      }
      // Asked again before every attempt: a re-send for a caller who is no
      // longer current is cancelled, not sent as them.
      const agent = await internals.agentFor(caller.principal, where)
      reply = await dispatch(agent, send, call)
      break
    } catch (error) {
      const resend =
        request.resend &&
        (write
          ? !management && retryUpdate(error, resends)
          : resends < UPDATE_RESEND_DELAYS_MS.length && isRetryable(error))
      if (!resend) throw error
      await sleep(UPDATE_RESEND_DELAYS_MS[resends])
    }
  }
  if (send === "oneway") return undefined
  return decodeReply(method, reply as Uint8Array, internals.maxDepth, {
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
  readonly signal?: AbortSignal
}

/**
 * Sends one attempt and returns the reply bytes (`undefined` for a oneway).
 * Rejects with the classified failure.
 */
async function dispatch(
  agent: HttpAgent,
  send: Send,
  call: Outgoing
): Promise<Uint8Array | undefined> {
  const effectiveTarget = { canisterId: call.effective }
  // Whether the request may be in the IC: only once `agent.call` returned,
  // which it does for a 200 or a 202. Until then every failure is the request
  // being refused or lost on its way in, which the classifier reads from the
  // failure itself.
  let accepted = false
  try {
    if (send === "query") {
      const response = await agent.query(call.canisterId, {
        methodName: call.methodName,
        arg: call.arg,
        effectiveTarget,
      })
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
    const submitted = await agent.call(call.canisterId, {
      methodName: call.methodName,
      arg: call.arg,
      effectiveTarget,
      // A oneway expects no reply, so it is sent asynchronously and settles
      // once the IC has accepted it.
      ...(send === "oneway" ? { callSync: false } : {}),
    })
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
    const reply = await readCertificate(
      agent,
      body.certificate,
      call.effective,
      requestId
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
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
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
 * It stops, and rejects, as soon as `signal` aborts: before each poll and
 * during every wait between two. A read whose observer went away (TanStack
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
      const { reply } = await pollForResponse(
        agent,
        { canisterId: effective },
        requestId,
        { strategy }
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
  maxDepth: number,
  context: { method: string; canisterId: string; mode: CallMode }
): unknown {
  const decoded = decodeArgs(method.results, reply, { maxDepth })
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
