/**
 * The builders on a client: `queryKey`, `queryOptions`, `mutationOptions`
 * and `func`, with `canister` from `canister.ts`. Each returns a fresh plain
 * object (DECISIONS Q3): TanStack compares keys by their hash, so nothing is
 * gained by caching one, and a cached read would pin the caller it was built
 * for.
 *
 * The types the `Client` interface gives these functions are generic over the
 * generated `Actor`; the implementations below read plain values and are cast
 * to those types once, in {@link createBuilders}. `decodeArgs` returns
 * `unknown[]`, and the generated `Actor` type is the static description of
 * what the schemas just checked, so that cast is where the one unavoidable
 * `unknown` becomes the `Actor`'s reply type.
 *
 * Internal: not exported from the package entry.
 *
 * @module
 */
import { isPrincipal, resolveSchema } from "@candid-core/schema"
import { encodeArgs, type EncodeResult } from "@candid-core/schema/codec"
import {
  skipToken,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
} from "@tanstack/query-core"
import {
  UNKNOWN_WRITES,
  invoke,
  isWrite,
  prepareMethod,
  valuesOf,
  type ResolvedTarget,
} from "./call.js"
import {
  canisterFactory,
  describe,
  methodOf,
  recordOf,
  type CanisterRecord,
} from "./canister.js"
import type { Caller, Client, ClientInternals } from "./client.js"
import { isReactorError, retryQuery } from "./errors.js"
import {
  CERTIFIED,
  INVALID,
  KEY_ROOT,
  SKIP,
  stableText,
  toHex,
} from "./keys.js"
import { MANAGEMENT_CANISTER } from "./management.js"

/** The builders `createClient` puts on a client. */
export type Builders = Pick<
  Client,
  | "canister"
  | "queryKey"
  | "queryOptions"
  | "mutationOptions"
  | "resendOf"
  | "func"
>

/** What an update read with `{ update: "idempotent" }` adds to its options (DECISIONS Q2). */
const IDEMPOTENT = Object.freeze({
  staleTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
})

const never = (): boolean => false

const slotOf = (target: ResolvedTarget): string =>
  target.ok ? target.id : target.slot

/** The args segments of a key: the hex of the encoding, or the tag and text of arguments that do not encode. */
const argsSegments = (encoded: EncodeResult, vars: unknown): string[] =>
  encoded.ok ? [toHex(encoded.bytes)] : [INVALID, stableText(vars)]

/**
 * Checks the fourth argument of `queryOptions`, and says whether it opts an
 * update in as a read.
 */
function readQueryOptionsArg(options: unknown): boolean {
  if (options === undefined) return false
  if (
    typeof options === "object" &&
    options !== null &&
    Object.keys(options).length === 1 &&
    (options as { update?: unknown }).update === "idempotent"
  ) {
    return true
  }
  throw new TypeError(
    `[ic-reactor] client.queryOptions() takes { update: "idempotent" } as its fourth argument, or nothing; got ${describe(options)}.`
  )
}

/** Whether a settled mutation may have changed what its canister's reads return. */
const mayHaveChanged = (error: unknown): boolean =>
  error === null ||
  error === undefined ||
  // Not ours (a bug, or code the app wrapped around the call): it proves
  // nothing, so the reads are refreshed.
  !isReactorError(error) ||
  error.kind === "canister_err" ||
  error.mayHaveExecuted

/**
 * What one run of a mutation resolved, in one synchronous step when it
 * started: the canister it writes to, and the canisterId segments (and
 * method) of every read it invalidates. A `{ name }` is resolved from the
 * `ic_env` cookie, which a local redeploy can rewrite while an update is in
 * flight; resolving once keeps the write and its invalidation on the same
 * canister.
 */
interface MutationRun {
  readonly target: ResolvedTarget
  readonly invalidates: readonly {
    readonly slots: readonly string[]
    readonly method?: string
  }[]
}

/**
 * The property a run is kept under in what `onMutate` returns. A symbol, so
 * it cannot collide with a context of the app's, and `{ ...context }` copies
 * it when an app's own `onMutate` spreads this one's result into its own.
 */
const RUN = Symbol("ic-reactor.mutationRun")

/** The run carried by what `onMutate` returned, if it carries one. */
const runIn = (onMutateResult: unknown): MutationRun | undefined =>
  typeof onMutateResult === "object" && onMutateResult !== null
    ? (onMutateResult as { readonly [RUN]?: MutationRun })[RUN]
    : undefined

/**
 * The function context TanStack Query (5.89 and later) creates for one run of
 * a mutation and passes to `onMutate`, `mutationFn` and `onSettled` alike, if
 * one was passed: the key a run is kept under in `runsByContext`.
 */
const runKey = (context: unknown): object | undefined =>
  typeof context === "object" && context !== null ? context : undefined

/**
 * The builders of one client. `owner` returns the client, which is built
 * after its builders.
 *
 * `current` says whom `queryKey` and `queryOptions` build for: the client's
 * live caller, or the principal a view of the client is pinned to (see
 * `CLIENT_AS` in `client.ts`). A read built for it still asks `agentFor` for
 * that principal's agent, so it is cancelled rather than sent while someone
 * else is current. Writes, direct calls and `func` read the live caller when
 * they run.
 */
export function createBuilders(
  internals: ClientInternals,
  owner: () => Client,
  current: () => Caller = internals.current,
  refusals?: WeakSet<object>
): Builders {
  const network = internals.network.keySegment
  const pinned = current !== internals.current

  /**
   * A read built for a pinned principal, refused because someone else is
   * current (`caller_changed`), must not leave the refusal as its query's
   * error: a component that shows the key once that principal is current
   * again (a sign-out after a signed-in reload) would show it. A query with
   * data is left as it was found: TanStack reverts the fetch, as it reverts
   * one its last observer left. A query with no data keeps the error for
   * now, since a suspense read of a reverted one would fetch it again at once
   * and be refused again (a hydrating boundary then never settles); the error
   * goes into `refusals`, and the client clears it from the query once the
   * pinned principal is current again.
   */
  const keepOnRefusal = async (
    context: QueryFunctionContext,
    read: Promise<unknown>
  ): Promise<unknown> => {
    try {
      return await read
    } catch (error) {
      if (
        !context.signal.aborted &&
        isReactorError(error) &&
        error.code === "caller_changed"
      ) {
        // TanStack 5.62 does not hand the context its `QueryClient`.
        const queryClient =
          (context as { client?: QueryClient }).client ?? owner().queryClient
        const query = queryClient
          .getQueryCache()
          .find({ queryKey: context.queryKey, exact: true })
        if (query?.state.data !== undefined) void query.cancel({ revert: true })
        else refusals?.add(error)
      }
      throw error
    }
  }

  /**
   * What was resolved for each run of a mutation, by the function context
   * TanStack Query (5.89 and later) creates for the run and passes to
   * `onMutate`, `mutationFn` and `onSettled` alike: how `mutationFn` finds
   * what `onMutate` resolved, and `onSettled` what `mutationFn` wrote to,
   * even when an `onMutate` of the app's replaced ours.
   */
  const runsByContext = new WeakMap<object, MutationRun>()

  /**
   * The argument of each re-send `resendOf` offered, and the caller who sent
   * it first: a mutation given that very argument sends it as that caller, or
   * is cancelled.
   */
  const offered = new WeakMap<object, Caller>()

  /** The run kept for a run's function context, if TanStack passed one and a run was kept for it. */
  const keptRun = (context: unknown): MutationRun | undefined => {
    const key = runKey(context)
    return key === undefined ? undefined : runsByContext.get(key)
  }

  /** A read's key, cut short where `method` or `args` are left out. */
  const readKey = (
    record: CanisterRecord,
    caller: string,
    target: ResolvedTarget,
    method?: string,
    args?: readonly string[]
  ): string[] => {
    const key = [KEY_ROOT, network, caller, slotOf(target)]
    if (method === undefined) return key
    key.push(method)
    if (args === undefined) return key
    key.push(...args)
    if (record.certified) key.push(CERTIFIED)
    return key
  }

  const queryKey = (canister: unknown, ...rest: unknown[]): QueryKey => {
    const call = "client.queryKey()"
    const record = recordOf(canister, internals, call)
    const caller = current().principal
    const target = record.resolve()
    const [method, vars] = rest
    if (method === undefined) return readKey(record, caller, target)
    const prepared = methodOf(record, method, call)
    // Two arguments give the method's prefix, and three one read's key. A
    // method without arguments has one read, so two arguments give its key:
    // the one `queryOptions(c, method)` gives, which `getQueryData` and
    // `setQueryData` must be handed whole.
    if (rest.length < 2 && prepared.args.length > 0) {
      return readKey(record, caller, target, prepared.name)
    }
    if (vars === skipToken) {
      return readKey(record, caller, target, prepared.name, [SKIP])
    }
    const encoded = encodeArgs(prepared.args, valuesOf(prepared, vars))
    return readKey(
      record,
      caller,
      target,
      prepared.name,
      argsSegments(encoded, vars)
    )
  }

  const queryOptions = (
    canister: unknown,
    method: unknown,
    vars: unknown,
    options?: unknown
  ) => {
    const call = "client.queryOptions()"
    const record = recordOf(canister, internals, call)
    const prepared = methodOf(record, method, call)
    const idempotent = readQueryOptionsArg(options)
    if (prepared.mode === "oneway") {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} is a oneway method; it has no reply to cache. Call it directly, or through mutationOptions().`
      )
    }
    // A call of a method without results resolves `undefined`, and TanStack
    // Query takes a query function that resolves `undefined` for a failed
    // read: it reports an error and caches nothing, although the call
    // succeeded. Refused here, at build time, like a oneway.
    if (prepared.results.length === 0) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} has no results, and a method without results has nothing to cache. ` +
          `Call it directly${isWrite(prepared.mode) ? ", or through mutationOptions()" : ""}.`
      )
    }
    if (isWrite(prepared.mode) && !idempotent) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} is an update method, and a query refetches: every refetch would run the update again. ` +
          `Use client.mutationOptions() for a write. Only for an update that returns the same answer however often it runs ` +
          `(such as ckBTC's get_btc_address), pass { update: "idempotent" } as the fourth argument.`
      )
    }
    if (record.certified && prepared.mode === "composite_query") {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} is a composite query, which has no certified path. Read it from the canister made without certified: true.`
      )
    }
    // The read is made as the caller current now (or the one a view is
    // pinned to), and only ever as them: the key holds their principal, and
    // the query function asks for their agent, which is refused while someone
    // else is signed in.
    const caller = current()
    const target = record.resolve()
    const write = isWrite(prepared.mode)
    const base = {
      // A read of `aaaaa-aa` made from an update is never sent twice, like
      // every other write to it.
      retry:
        write && target.ok && target.id === MANAGEMENT_CANISTER
          ? never
          : retryQuery,
      ...(idempotent ? IDEMPOTENT : {}),
    }
    if (vars === skipToken) {
      return {
        queryKey: readKey(record, caller.principal, target, prepared.name, [
          SKIP,
        ]),
        queryFn: skipToken,
        ...base,
      }
    }
    const values = valuesOf(prepared, vars)
    const encoded = encodeArgs(prepared.args, values)
    return {
      queryKey: readKey(
        record,
        caller.principal,
        target,
        prepared.name,
        argsSegments(encoded, vars)
      ),
      queryFn: (context: QueryFunctionContext) => {
        const read = invoke(internals, {
          method: prepared,
          target,
          certified: record.certified,
          caller,
          values,
          encoded,
          signal: context.signal,
          resend: false,
          canister: canister as object,
        })
        return pinned ? keepOnRefusal(context, read) : read
      },
      ...base,
    }
  }

  /** Checks the third argument of `mutationOptions`, and returns the reads it names. */
  const readInvalidates = (
    canister: unknown,
    options: unknown
  ): { readonly record: CanisterRecord; readonly method?: string }[] => {
    const call = "client.mutationOptions()"
    if (options !== undefined) {
      const keys =
        typeof options === "object" && options !== null
          ? Object.keys(options)
          : undefined
      if (keys === undefined || keys.some((key) => key !== "invalidates")) {
        throw new TypeError(
          `[ic-reactor] ${call} takes { invalidates } as its third argument, or nothing; got ${describe(options)}. ` +
            "A mutation is never retried: an update re-sent after an unknown outcome can run twice."
        )
      }
    }
    const listed = (options as { invalidates?: unknown } | undefined)
      ?.invalidates
    if (listed === undefined) {
      return [{ record: recordOf(canister, internals, call) }]
    }
    if (!Array.isArray(listed)) {
      throw new TypeError(
        `[ic-reactor] ${call}: invalidates is a list of canisters and [canister, method] pairs, got ${describe(listed)}.`
      )
    }
    return listed.map((entry: unknown) => {
      if (Array.isArray(entry)) {
        const [target, method] = entry as unknown[]
        const record = recordOf(target, internals, `${call} invalidates`)
        return {
          record,
          method: methodOf(record, method, `${call} invalidates`).name,
        }
      }
      return { record: recordOf(entry, internals, `${call} invalidates`) }
    })
  }

  const mutationOptions = (
    canister: unknown,
    method: unknown,
    options?: unknown
  ) => {
    const call = "client.mutationOptions()"
    const record = recordOf(canister, internals, call)
    const prepared = methodOf(record, method, call)
    const invalidates = readInvalidates(canister, options)
    // One synchronous step, so that every `{ name }` here (the canister
    // written to, and any listed in `invalidates`) is read from the same
    // cookie.
    const resolveRun = (): MutationRun => ({
      target: record.resolve(),
      invalidates: invalidates.map(({ record: listed, method: only }) => ({
        slots: listed.slots(),
        method: only,
      })),
    })
    return {
      mutationKey: [
        KEY_ROOT,
        network,
        slotOf(record.resolve()),
        prepared.name,
      ] as const,
      // TanStack runs this first, before mutationFn, and hands what it
      // returns to onSettled.
      onMutate: (_vars: unknown, context?: unknown): object => {
        const run = resolveRun()
        const key = runKey(context)
        if (key !== undefined) runsByContext.set(key, run)
        return { [RUN]: run }
      },
      // The caller is read when the mutation runs, unless the argument is a
      // re-send `resendOf` offered: that goes out as its first sender, or
      // not at all (`agentFor` refuses another). The target is the one
      // onMutate resolved for this run where TanStack passes the run's
      // context (5.89 and later), and is resolved now otherwise.
      mutationFn: (vars: unknown, context?: unknown) => {
        // TanStack hands a pending mutation the options of a later render
        // only when their mutationKey is the same (another key detaches the
        // observer instead), so a run found here was made by options for the
        // same canister and method.
        let run = keptRun(context)
        const key = runKey(context)
        if (run === undefined && key !== undefined) {
          // An onMutate of the app's replaced ours, so nothing is resolved
          // for this run yet: resolve it now, and keep it for onSettled,
          // which TanStack hands the same context.
          run = resolveRun()
          runsByContext.set(key, run)
        }
        return invoke(internals, {
          method: prepared,
          target: run?.target ?? record.resolve(),
          certified: record.certified,
          caller: offered.get(vars as object) ?? internals.current(),
          values: valuesOf(prepared, vars),
          resend: true,
          canister: canister as object,
        })
      },
      retry: false as const,
      onSettled: async (
        _data: unknown,
        error: unknown,
        _vars: unknown,
        onMutateResult?: unknown,
        context?: unknown
      ): Promise<void> => {
        if (!mayHaveChanged(error)) return
        // The reads of the run mutationFn wrote with, found by the run's
        // context (5.89 and later); else those onMutate returned (before
        // 5.89); else, when an onMutate of the app's replaced ours before
        // 5.89 or onSettled is called by hand, the reads resolved now.
        const run = keptRun(context) ?? runIn(onMutateResult) ?? resolveRun()
        const targets = run.invalidates
        if (targets.length === 0) return
        // Every caller's reads, certified or not: a write changes what the
        // canister answers to everyone.
        await owner().queryClient.invalidateQueries({
          predicate: ({ queryKey: key }) =>
            key[0] === KEY_ROOT &&
            key[1] === network &&
            targets.some(
              ({ slots, method: only }) =>
                slots.includes(key[3] as string) &&
                (only === undefined || key[4] === only)
            ),
        })
      },
    }
  }

  const resendOf = (
    error: unknown,
    canister: unknown,
    method: unknown,
    options?: { readonly dedupedBy?: unknown }
  ) => {
    const call = "client.resendOf()"
    const { name, args } = methodOf(
      recordOf(canister, internals, call),
      method,
      call
    )
    const dedupedBy = options?.dedupedBy
    if (typeof dedupedBy !== "function") {
      throw new TypeError(
        `[ic-reactor] ${call} needs { dedupedBy: (arg) => key }: what makes ${name} run the same argument at most once, such as an ICRC-1 transfer's created_at_time. ` +
          "A write without one has no safe re-send."
      )
    }
    // Kept only for a write whose outcome is unknown, made on `canister`.
    const attempt = UNKNOWN_WRITES.get(error as object)
    if (
      attempt === undefined ||
      attempt.canister !== canister ||
      attempt.method.name !== name
    ) {
      return undefined
    }
    const { values, caller } = attempt
    const arg = args.length > 1 ? values : values[0]
    if (
      typeof arg !== "object" ||
      arg === null ||
      // The sender, and no one else, may send it again.
      internals.current().principal !== caller.principal ||
      (dedupedBy(arg) ?? null) === null
    ) {
      return undefined
    }
    offered.set(arg, caller)
    return {
      arg,
      from: caller.principal,
      send: () => invoke(internals, attempt),
    }
  }

  const func = (funcSchema: unknown, ref: unknown) => {
    const call = "client.func()"
    let node: ReturnType<typeof resolveSchema>
    try {
      node = resolveSchema(funcSchema as Parameters<typeof resolveSchema>[0])
    } catch (cause) {
      const error = new TypeError(
        `[ic-reactor] ${call} takes a func schema, such as the generated QueryArchiveFn: ${
          cause instanceof Error ? cause.message : String(cause)
        }.`
      )
      Object.defineProperty(error, "cause", { value: cause })
      throw error
    }
    if (node.kind !== "func") {
      throw new TypeError(
        `[ic-reactor] ${call} takes a func schema, such as the generated QueryArchiveFn; got a ${node.kind} schema.`
      )
    }
    const { principal, method } = (
      typeof ref === "object" && ref !== null ? ref : {}
    ) as { principal?: unknown; method?: unknown }
    if (!isPrincipal(principal)) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${describe(principal)} is not a canister's principal text. Pass the func value the reply carried, { principal, method }.`
      )
    }
    if (typeof method !== "string" || method === "") {
      throw new TypeError(
        `[ic-reactor] ${call}: ${describe(method)} is not a method name. Pass the func value the reply carried, { principal, method }.`
      )
    }
    const prepared = prepareMethod({
      name: method,
      mode: node.mode,
      args: node.args,
      results: node.results,
    })
    const target: ResolvedTarget = { ok: true, id: principal }
    return async (...args: unknown[]): Promise<unknown> =>
      invoke(internals, {
        method: prepared,
        target,
        certified: false,
        caller: internals.current(),
        values: args,
        resend: true,
      })
  }

  return {
    canister: canisterFactory(internals),
    queryKey,
    queryOptions,
    mutationOptions,
    resendOf,
    func,
  } as unknown as Builders
}
