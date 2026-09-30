// createClient and the handles it builds.
import type { AnyFieldSchema, ServiceMethod } from "@candid-core/schema"
import { resolveSchema } from "@candid-core/schema"
import { decodeArgs, encodeArgs } from "@candid-core/schema/codec"
import { isResultSchema, unwrapResult } from "@candid-core/schema/validate"
import {
  AnonymousIdentity,
  HttpAgent,
  QueryResponseStatus,
  type Identity,
} from "@icp-sdk/core/agent"
import {
  skipToken,
  type MutationFunctionContext,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
  type SkipToken,
} from "@tanstack/query-core"
import {
  classifyAgentError,
  isReactorError,
  reactorError,
  type ReactorFailure,
} from "./errors.js"
import { fromWire, toWire, type PrincipalText } from "./principal.js"
import type { ActorShape, ModeMap, ServiceDef } from "./service.js"
import type { Canister, MutationConfig, ReadHandle } from "./types.js"

/** Where the canisters are. `"ic"` is mainnet; `"local"` is a replica on 127.0.0.1:4943. */
export type Network =
  | "ic"
  | "local"
  | {
      readonly host: string
      /** The root key of a local replica. Fetched from the replica only when absent and the host is local. */
      readonly rootKey?: Uint8Array
      /** The network's name in query keys. Defaults to `host`. */
      readonly name?: string
    }

/** A sign-in source, such as an adapter over `@icp-sdk/auth`'s `AuthClient`. */
export interface AuthSource {
  /** The current identity: the anonymous identity while signed out. */
  getIdentity(): Identity
  isAuthenticated(): boolean
  /** Called after every sign-in, sign-out or principal switch. */
  subscribe(listener: () => void): () => void
}

export type ClientOptions =
  | {
      readonly network: Network
      readonly identity?: Identity
      readonly auth?: never
    }
  | {
      readonly network: Network
      readonly auth: AuthSource
      readonly identity?: never
    }

export interface Client {
  /** The network's name, as it appears in query keys. */
  readonly network: string
  /** The current caller's principal (the anonymous principal while signed out). */
  caller(): PrincipalText
  /** Whether a write would be sent now: signed in, and not anonymous. */
  isAuthenticated(): boolean
  /** Called when the caller changes. Shaped for React's `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void
  /** Typed, mode-gated handles for one canister of `service`. */
  canister<A extends ActorShape, M extends ModeMap<A>>(
    service: ServiceDef<A, M>,
    options: { readonly id: string }
  ): Canister<A, M>
}

interface Caller {
  readonly principal: PrincipalText
  readonly identity: Identity
  readonly authenticated: boolean
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/

function resolveNetwork(network: Network) {
  if (network === "ic")
    return { name: "ic", host: "https://icp-api.io", fetchRootKey: false }
  if (network === "local") {
    return { name: "local", host: "http://127.0.0.1:4943", fetchRootKey: true }
  }
  // A root key is fetched only from a local replica: anywhere else the
  // replica could hand over a key of its own choosing.
  const local = LOCAL_HOSTS.test(new URL(network.host).hostname)
  return {
    name: network.name ?? network.host,
    host: network.host,
    rootKey: network.rootKey,
    fetchRootKey: network.rootKey === undefined && local,
  }
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createClient(options: ClientOptions): Client {
  const net = resolveNetwork(options.network)
  const auth = options.auth
  const fixedIdentity = options.identity ?? new AnonymousIdentity()
  // One immutable agent per principal. An identity object replaced for the
  // same principal (a renewed delegation) replaces that principal's agent.
  const agents = new Map<
    string,
    { identity: Identity; agent: Promise<HttpAgent> }
  >()

  const current = (): Caller => {
    const identity = auth ? auth.getIdentity() : fixedIdentity
    const p = identity.getPrincipal()
    return {
      principal: p.toText() as PrincipalText,
      identity,
      authenticated: !p.isAnonymous() && (auth ? auth.isAuthenticated() : true),
    }
  }

  const agentFor = (caller: Caller): Promise<HttpAgent> => {
    const entry = agents.get(caller.principal)
    if (entry && entry.identity === caller.identity) return entry.agent
    const agent = HttpAgent.create({
      host: net.host,
      identity: caller.identity,
      ...(net.rootKey ? { rootKey: net.rootKey } : {}),
      shouldFetchRootKey: net.fetchRootKey,
    })
    agent.catch(() => {
      if (agents.get(caller.principal)?.agent === agent)
        agents.delete(caller.principal)
    })
    agents.set(caller.principal, { identity: caller.identity, agent })
    return agent
  }

  const client: Client = {
    network: net.name,
    caller: () => current().principal,
    isAuthenticated: () => current().authenticated,
    subscribe: (listener) => (auth ? auth.subscribe(listener) : () => {}),
    canister<A extends ActorShape, M extends ModeMap<A>>(
      service: ServiceDef<A, M>,
      { id }: { readonly id: string }
    ): Canister<A, M> {
      const handles: Record<string, unknown> = {}
      for (const method of service.methods.values()) {
        handles[method.name] = makeHandle({
          network: net.name,
          canisterId: id,
          method,
          current,
          agentFor,
        })
      }
      return handles as Canister<A, M>
    },
  }
  return client
}

interface HandleContext {
  readonly network: string
  readonly canisterId: string
  readonly method: ServiceMethod
  readonly current: () => Caller
  readonly agentFor: (caller: Caller) => Promise<HttpAgent>
}

function makeHandle(ctx: HandleContext) {
  const { network, canisterId, method } = ctx
  const isRead = method.mode === "query" || method.mode === "composite_query"
  const where = { method: method.name, canisterId }
  const fail = (
    kind: "invalid_args" | "unauthenticated" | "invalid_reply" | "cancelled",
    message: string,
    mayHaveExecuted: boolean,
    cause?: unknown
  ) =>
    reactorError({
      kind,
      message: `${method.name}: ${message}`,
      ...where,
      mayHaveExecuted,
      cause,
    })

  const encode = (args: readonly unknown[]): Uint8Array => {
    if (!Array.isArray(args)) {
      throw fail(
        "invalid_args",
        "arguments must be the argument tuple, e.g. [arg]",
        false
      )
    }
    let wire: unknown[]
    try {
      wire = args.map((value, i) =>
        method.args[i] ? toWire(method.args[i], value) : value
      )
    } catch (cause) {
      throw fail("invalid_args", String(cause), false, cause)
    }
    const encoded = encodeArgs(method.args, wire)
    if (!encoded.ok) {
      const issue = encoded.issues[0]
      throw fail(
        "invalid_args",
        `${issue?.message ?? "encode failed"} at ${issue?.path ?? "$"}`,
        false,
        encoded.issues
      )
    }
    return encoded.bytes
  }

  const decode = (bytes: Uint8Array, write: boolean): unknown => {
    const decoded = decodeArgs(method.results, bytes)
    if (!decoded.ok) {
      throw fail(
        "invalid_reply",
        decoded.issues[0]?.message ?? "decode failed",
        write,
        decoded.issues
      )
    }
    const values = decoded.values
    if (method.results.length === 1 && isResultSchema(method.results[0])) {
      const schema = method.results[0] as AnyFieldSchema
      const node = resolveSchema(schema)
      const arms =
        node.kind === "variant"
          ? (node.arms as Record<string, AnyFieldSchema>)
          : {}
      const okTag = "Ok" in arms ? "Ok" : "ok"
      const errTag = "Err" in arms ? "Err" : "err"
      const outcome = unwrapResult(schema, values[0])
      if (outcome.issues) {
        throw fail(
          "invalid_reply",
          outcome.issues[0]?.message ?? "not a result",
          write,
          outcome.issues
        )
      }
      if (outcome.ok) return fromWire(arms[okTag], outcome.value)
      const err = fromWire(arms[errTag], outcome.error)
      const tag =
        err !== null && typeof err === "object" && "tag" in err
          ? String((err as { tag: unknown }).tag)
          : "Err"
      throw reactorError({
        kind: "canister_err",
        message: `${method.name}: canister_err: ${tag}`,
        ...where,
        mayHaveExecuted: false,
        err,
      })
    }
    const out = values.map((v, i) => fromWire(method.results[i], v))
    return out.length === 0 ? undefined : out.length === 1 ? out[0] : out
  }

  /** One attempt: encode, send as `caller`, decode. Never retries. */
  const once = async (
    caller: Caller,
    args: readonly unknown[],
    opts: { certified?: boolean; signal?: AbortSignal } = {}
  ): Promise<unknown> => {
    const replicated = !isRead || opts.certified === true
    const write = !isRead
    if (write && !caller.authenticated) {
      throw fail(
        "unauthenticated",
        "refused before sending: nobody is signed in",
        false
      )
    }
    const arg = encode(args)
    if (opts.signal?.aborted)
      throw fail("cancelled", "cancelled before sending", false)
    let agent: HttpAgent
    try {
      agent = await ctx.agentFor(caller)
    } catch (cause) {
      // Nothing was sent yet: the agent could not even be built.
      throw reactorError({
        kind: "not_delivered",
        message: `${method.name}: agent: ${String(cause)}`,
        ...where,
        mayHaveExecuted: false,
        cause,
      })
    }
    let reply: Uint8Array
    try {
      if (replicated) {
        reply = (
          await agent.update(canisterId, { methodName: method.name, arg })
        ).reply
      } else {
        const response = await agent.query(canisterId, {
          methodName: method.name,
          arg,
        })
        if (response.status !== QueryResponseStatus.Replied) {
          // The agent is called directly (not through candid-core's
          // httpTransport) so the reject code stays a number.
          throw reactorError({
            kind: response.reject_code === 2 ? "not_delivered" : "rejected",
            message: `${method.name}: rejected (${response.reject_code}): ${response.reject_message}`,
            ...where,
            mayHaveExecuted: false,
            rejectCode: response.reject_code,
          })
        }
        reply = response.reply.arg
      }
    } catch (error) {
      throw classifyAgentError(error, { ...where, update: write })
    }
    if (opts.signal?.aborted) throw fail("cancelled", "cancelled", write)
    return decode(reply, write)
  }

  /** A direct call: re-sent only after `not_delivered`, at most twice. */
  const direct = async (
    caller: Caller,
    args: readonly unknown[],
    certified = false
  ) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once(caller, args, { certified })
      } catch (error) {
        if (
          isReactorError(error) &&
          error.kind === "not_delivered" &&
          attempt < 2
        ) {
          await sleep(300 * 2 ** attempt)
          continue
        }
        throw error
      }
    }
  }

  const keyPrefix = (caller: PrincipalText) =>
    ["ic-reactor", network, caller, canisterId, method.name, "query"] as const

  const retryRead = (failureCount: number, error: ReactorFailure) =>
    failureCount < 3 && error.kind === "not_delivered"
  const retryWrite = (failureCount: number, error: ReactorFailure) =>
    failureCount < 2 && error.kind === "not_delivered"

  const handle = (args: readonly unknown[]) => direct(ctx.current(), args)
  Object.assign(handle, {
    mode: method.mode,
    method: method.name,
    canisterId,
    network,
  })

  if (isRead) {
    Object.assign(handle, {
      queryKey(args?: readonly unknown[]): QueryKey {
        const prefix = keyPrefix(ctx.current().principal)
        return args === undefined ? [...prefix] : [...prefix, hex(encode(args))]
      },
      queryOptions(args: readonly unknown[] | SkipToken) {
        const caller = ctx.current()
        const prefix = keyPrefix(caller.principal)
        if (args === skipToken) {
          return {
            queryKey: [...prefix, "skip"],
            queryFn: skipToken,
            retry: retryRead,
          }
        }
        const argsHex = hex(encode(args))
        return {
          queryKey: [...prefix, argsHex],
          // The caller is captured with the key: data under a principal's key
          // is only ever fetched as that principal.
          queryFn: ({ signal }: QueryFunctionContext) =>
            once(caller, args, { signal }),
          retry: retryRead,
        }
      },
    })
    if (method.mode === "query") {
      Object.assign(handle, {
        certified: (args: readonly unknown[]) =>
          direct(ctx.current(), args, true),
      })
    }
  } else {
    Object.assign(handle, {
      mutationOptions(
        config: MutationConfig<readonly unknown[], unknown, unknown> = {}
      ) {
        const reads = config.invalidates ?? []
        const invalidate = (client: QueryClient) =>
          reads.length === 0
            ? Promise.resolve()
            : client.invalidateQueries({
                predicate: ({ queryKey: k }) =>
                  k[0] === "ic-reactor" &&
                  reads.some(
                    (r: ReadHandle) =>
                      k[1] === r.network &&
                      k[3] === r.canisterId &&
                      k[4] === r.method
                  ),
              })
        return {
          mutationKey: [
            "ic-reactor",
            network,
            canisterId,
            method.name,
            "update",
          ],
          // Read at execution time: a write goes out as whoever is signed in
          // when it runs, and is refused if nobody is.
          mutationFn: (args: readonly unknown[]) => once(ctx.current(), args),
          retry: retryWrite,
          async onSuccess(
            data: unknown,
            args: readonly unknown[],
            _r: unknown,
            context: MutationFunctionContext
          ) {
            await invalidate(context.client)
            await config.onSuccess?.(data, args)
          },
          async onError(
            error: ReactorFailure,
            args: readonly unknown[],
            _r: unknown,
            context: MutationFunctionContext
          ) {
            if (isReactorError(error) && error.mayHaveExecuted)
              await invalidate(context.client)
            await config.onError?.(error as never, args)
          },
          async onSettled(
            data: unknown,
            error: ReactorFailure | null,
            args: readonly unknown[]
          ) {
            await config.onSettled?.(data, error as never, args)
          },
        }
      },
    })
  }
  return handle
}
