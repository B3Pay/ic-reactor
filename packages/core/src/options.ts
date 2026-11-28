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
import { isPrincipal, resolveSchema } from "@meantjs/schema"
import { encodeArgs, type EncodeResult } from "@meantjs/schema/codec"
import {
  skipToken,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
} from "@tanstack/query-core"
import { lookupResultToBuffer } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import {
  UNKNOWN_WRITES,
  differs,
  invoke,
  isWrite,
  prepareMethod,
  notEncoded,
  refused,
  resync,
  retriedWrite,
  slotOf,
  valuesOf,
  type ResolvedTarget,
} from "./call.js"
import {
  canisterFactory,
  describe,
  badTimeout,
  methodOf,
  recordOf,
  type CanisterRecord,
  type MutationRun,
} from "./canister.js"
import type { Caller, Client, ClientInternals } from "./client.js"
import {
  classifyError,
  createReactorError,
  fromCanister,
  isReactorError,
  isRetryable,
  retryQuery,
  timedOutError,
} from "./errors.js"
import {
  CERTIFIED,
  INVALID,
  KEY_ROOT,
  PAGES,
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
  | "encode"
  | "func"
  | "time"
>

/** What an update read with `{ update: "idempotent" }` adds to its options (DECISIONS Q2). */
const IDEMPOTENT = Object.freeze({
  staleTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
})

const never = (): boolean => false

/** The args segments of a key: the hex of the encoding, or the tag and text of arguments that do not encode. */
const argsSegments = (encoded: EncodeResult, vars: unknown): string[] =>
  encoded.ok ? [toHex(encoded.bytes)] : [INVALID, stableText(vars)]

/** What a paged read's `pages` is: the next page's variables, or `undefined` after the last. */
type NextPage = (page: unknown, vars: unknown) => unknown

/**
 * The `pages` of the fourth argument of `queryOptions`, for a read walked
 * through its pages; `undefined` when the argument names none.
 */
function readPagesArg(options: unknown): NextPage | undefined {
  if (typeof options !== "object" || options === null || !("pages" in options))
    return undefined
  const { pages } = options
  if (Object.keys(options).length === 1 && typeof pages === "function") {
    return pages as NextPage
  }
  throw new TypeError(
    `[ic-reactor] client.queryOptions(): pages comes alone, and is a function from a page to the next page's variables; got ${describe(options)}.`
  )
}

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
    `[ic-reactor] client.queryOptions() takes { update: "idempotent" } or { pages } as its fourth argument, or nothing; got ${describe(options)}.`
  )
}

/**
 * The `time` path of the state tree, copied into the global `Uint8Array`, the
 * one the agent's CBOR encoder knows bytes by (`instanceof`). Under a test's
 * jsdom that is jsdom's, while `TextEncoder` hands out Node's, and the encoder
 * sent such a label as a map: the `read_state` the replica received was not
 * the one the agent signed, so a signed-in caller's was refused (#949). The
 * fake replica copies its labels for the same reason.
 */
const TIME_PATH = [Uint8Array.from(new TextEncoder().encode("time"))]

/**
 * How far, in nanoseconds, a time `client.time()` reads may be before one the
 * client read already: five minutes, the agent's own bound on a certificate's
 * age. Subnets, and the nodes of one, are seconds apart; an old certificate
 * a node answers with is further back.
 */
const TIME_SLACK = 300_000_000_000n

/** An unsigned LEB128 number, as the state tree writes `time`. */
function readLeb128(bytes: Uint8Array): bigint {
  let value = 0n
  let shift = 0n
  for (const byte of bytes) {
    value |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return value
    shift += 7n
  }
  throw new Error("the certificate's time is not a complete LEB128 number")
}

/**
 * What a builder says when it is handed a symbol that is not the
 * `skipToken` of the `@tanstack/query-core` this package imports. Correct
 * variables are never a symbol (but see {@link takesAnything}), so such a
 * symbol is almost always the `skipToken` of another copy of
 * `@tanstack/query-core`: npm installs one beside the exact version
 * `@tanstack/react-query` depends on when the two do not match, and each copy
 * has its own `skipToken`. Encoded, it would make a read that is never
 * skipped and rejects `invalid_args`.
 */
const twoQueryCores = (call: string): string =>
  `[ic-reactor] ${call}: the variables are a symbol, not core's skipToken: two copies of @tanstack/query-core are installed (or a bundler loads it twice). ` +
  "Install it at the exact version @tanstack/react-query depends on; `npm ls @tanstack/query-core` must show one copy."

/**
 * Whether a method's one argument is Candid `reserved`, which every value
 * inhabits, a symbol included: the one method whose variables may be a
 * symbol.
 */
const takesAnything = (method: {
  readonly args: readonly unknown[]
}): boolean => {
  if (method.args.length !== 1) return false
  try {
    const node = resolveSchema(
      method.args[0] as Parameters<typeof resolveSchema>[0]
    )
    return (
      node.kind === "primitive" &&
      (node as { primitive?: unknown }).primitive === "reserved"
    )
  } catch {
    // A schema resolveSchema refuses takes no symbol either.
    return false
  }
}

/** Throws {@link twoQueryCores} for a symbol that is not our `skipToken`, unless the method takes anything. */
const refuseForeignSymbol = (
  vars: unknown,
  method: { readonly args: readonly unknown[] },
  call: string
): void => {
  if (
    typeof vars === "symbol" &&
    vars !== skipToken &&
    !takesAnything(method)
  ) {
    throw new TypeError(twoQueryCores(call))
  }
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
 * The function context TanStack Query creates for one run of a mutation and
 * passes to `onMutate`, `mutationFn` and `onSettled` alike, if one was
 * passed: the key a run is kept under by the method of its canister
 * (`CanisterMethod.runs`). A call made by hand may pass none.
 */
const runKey = (context: unknown): object | undefined =>
  typeof context === "object" && context !== null ? context : undefined

/**
 * What an attempt of a mutation run rejected with when it says the attempt
 * may have executed: what refuses a later attempt of the same run
 * ({@link earlierAttempt}).
 *
 * A run is known by the function context TanStack Query passes every attempt
 * of it. Its record is kept under that context alone, and lives as long as
 * it: the argument is left out, since a `mutationFn` of the app's own that
 * calls ours may make a new one for each attempt. A call with no context is
 * one made by hand, and leaves nothing here.
 */
const unknownAttempts = new WeakMap<object, unknown>()

/**
 * Whether the attempt of a write that rejected with `reason` may have
 * executed. An error of the client's says (`mayHaveExecuted`), and what a
 * call of the client's rejects with is always one. What TanStack kept as the
 * `failureReason` of a run a persister restored may not say: it may be the
 * copy of the client's error that the persister wrote and read back, and then
 * nothing says the attempt did not run. JSON keeps the field. A structured
 * clone, which a persister on IndexedDB stores, keeps an error's message and
 * none of its fields. The client refuses the writes of a restored run
 * whatever this answers, so reading the copy this way holds back no write it
 * would send.
 */
const mayHaveRun = (reason: unknown): boolean =>
  typeof reason === "object" &&
  reason !== null &&
  (reason as { readonly mayHaveExecuted?: unknown }).mayHaveExecuted !== false

/**
 * What an earlier attempt of the run a `mutationFn` is called for rejected
 * with, when that attempt may have executed ({@link mayHaveRun}), and
 * `undefined` when no attempt of the run did. `options` is the object the
 * function was called on. A call with no context is one made by hand, a new
 * call each time: it has no earlier attempt.
 *
 * Found in {@link unknownAttempts}. For a run the client did not see start
 * (`started` is `false`: neither its `MutationCache` nor our `onMutate` read
 * who started it), TanStack's own record of the run is read too, the
 * `failureReason` it keeps while it retries, in the `QueryClient` the
 * context names: a run TanStack restored from a persister comes with the
 * attempts it made before the reload. Pending runs with the same options
 * object and the same argument cannot be told apart there, so none of them
 * is sent while one of them waits to retry such an attempt.
 */
export const earlierAttempt = (
  options: unknown,
  vars: unknown,
  context: unknown,
  started: boolean
): unknown => {
  const key = runKey(context)
  if (key === undefined) return undefined
  const kept = unknownAttempts.get(key)
  if (kept !== undefined || started) return kept
  return (key as { readonly client?: QueryClient }).client
    ?.getMutationCache()
    .getAll()
    .find(
      ({ options: own, state }) =>
        own === options &&
        state.status === "pending" &&
        state.variables === vars &&
        mayHaveRun(state.failureReason)
    )?.state.failureReason
}

/**
 * The builders of one client. `owner` returns the client, which is built
 * after its builders.
 *
 * `current` says whom `queryKey` and `queryOptions` build for: the client's
 * live caller, or the principal a view of the client is pinned to (see
 * `CLIENT_AS` in `client.ts`). A read built for it still asks `agentFor` for
 * that principal's agent, so it is cancelled rather than sent while someone
 * else is current. A write reads the live caller when it starts (its
 * `onMutate`, run by `mutate()`), and direct calls and `func` when they run.
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
        // A context made by hand may name no `QueryClient`.
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

  const { offered } = internals

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
    refuseForeignSymbol(vars, prepared, call)
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
    const pages = readPagesArg(options)
    const idempotent = pages === undefined && readQueryOptionsArg(options)
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
    // The next page is asked for with other arguments, and a method that
    // takes none has no other.
    if (pages !== undefined && prepared.args.length === 0) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} takes no arguments, so it has no page after its first.`
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
    refuseForeignSymbol(vars, prepared, call)
    const values = valuesOf(prepared, vars)
    const encoded = encodeArgs(prepared.args, values)
    return {
      queryKey: readKey(
        record,
        caller.principal,
        target,
        prepared.name,
        pages
          ? [...argsSegments(encoded, vars), PAGES]
          : argsSegments(encoded, vars)
      ),
      queryFn: (context: QueryFunctionContext) => {
        const send = (
          values: readonly unknown[],
          encoded: EncodeResult
        ): Promise<unknown> =>
          invoke(internals, {
            method: prepared,
            target,
            certified: record.certified,
            caller,
            values,
            encoded,
            signal: context.signal,
            timeoutMs: record.timeoutMs,
            resend: false,
            canister: canister as object,
            via: "query",
          })
        // Every page is a call of its own, made as the same caller and under
        // the same signal, from the first to the one `pages` names no page
        // after: a list cut short would read as the whole of it. Arguments
        // the walk has sent before would send it round for ever.
        const walk = async (): Promise<unknown[]> => {
          const all: unknown[] = []
          const sent = new Set<string>()
          let at = { vars, values, encoded }
          for (;;) {
            if (at.encoded.ok) sent.add(toHex(at.encoded.bytes))
            const page = await send(at.values, at.encoded)
            all.push(page)
            const next = pages!(page, at.vars)
            if (next === undefined) return all
            const values = valuesOf(prepared, next)
            const encoded = encodeArgs(prepared.args, values)
            // Marked with the canister, as each page's own error is, so that
            // `isReactorError(error, canister, method)` matches it.
            if (encoded.ok && sent.has(toHex(encoded.bytes))) {
              throw fromCanister(
                createReactorError("invalid_args", {
                  method: prepared.name,
                  canisterId: slotOf(target),
                  code: "page_repeated",
                  reason:
                    "pages() gave the variables of a page this read has asked for already, so it would never end",
                }),
                canister as object
              )
            }
            at = { vars: next, values, encoded }
          }
        }
        const read = pages ? walk() : send(values, encoded)
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
      if (
        keys === undefined ||
        keys.some((key) => key !== "invalidates" && key !== "timeoutMs") ||
        badTimeout((options as { timeoutMs?: unknown }).timeoutMs)
      ) {
        throw new TypeError(
          `[ic-reactor] ${call} takes { invalidates, timeoutMs } (timeoutMs: 1 to 2147483647 ms) as its third argument, or nothing; got ${describe(options)}. ` +
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
    const timeoutMs = (options as { timeoutMs?: number } | undefined)?.timeoutMs
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

    /** What this method of this canister keeps for a run's function context, if one was passed and a run was kept for it. */
    const keptRun = (context: unknown): MutationRun | undefined => {
      const key = runKey(context)
      return key && prepared.runs.get(key)
    }

    // The write goes out as the caller current when `mutate()` started its
    // run, or not at all: `agentFor` refuses it (`caller_changed`, nothing
    // sent) while someone else is current, as when TanStack held it back
    // offline or behind its `scope` and the account was switched meanwhile,
    // and a run whose caller is not known is refused here. That caller is
    // found by the run's context, in `mutationCallers`: what the client's
    // `MutationCache` read for it, which no option replaces, else what our
    // `onMutate` read (a run on another `QueryClient`, or one whose
    // `mutationFn` is the app's own). Neither, for a run TanStack restored
    // from a persister (it runs no `onMutate` for one), or one on another
    // `QueryClient` whose `onMutate` replaced ours. A call with no context
    // is one made by hand, and goes out as the caller current now. A re-send
    // `resendOf` offered goes out as its first sender, to the canister id it
    // went to, with the bytes it had, or not at all (`run` checks the rest).
    // The target is the one onMutate resolved for this run, found by the
    // run's context, and is resolved now for a call by hand.
    const mutationFn = function (
      this: unknown,
      vars: unknown,
      context?: unknown
    ) {
      // A run found here was resolved for this method of this canister
      // object, by our onMutate or by an earlier call of this function: of
      // these options, or of the ones an earlier render built from the same
      // canister object (TanStack hands a pending mutation the options of a
      // later render only when their mutationKey is the same; another key
      // detaches the observer instead).
      let run = keptRun(context)
      const key = runKey(context)
      if (run === undefined && key !== undefined) {
        // Nothing is resolved for this run and this method yet. An onMutate
        // of the app's replaced ours, or a mutationFn of the app's handed
        // this one the context of a run that other options started (those
        // of another canister, or of another method of this one), whose
        // write goes to their canister and whose reads are theirs, or a
        // later render built these options from another canister object of
        // the canister the run started on. Resolve ours now, and keep them
        // for our onSettled, which gets the same context.
        run = resolveRun()
        prepared.runs.set(key, run)
      }
      const target = run?.target ?? record.resolve()
      const where = { method: prepared.name, canisterId: slotOf(target) }
      const again = offered.get(vars as object)
      const caller =
        again?.caller ??
        (key ? internals.mutationCallers.get(key) : internals.current())
      // An attempt TanStack makes for a `retry` of the app's, after an
      // attempt of the same run that may have executed, is never sent: it
      // would be a new request, and the canister would run the write again.
      // Checked before anything else, so that the run ends saying the write
      // may have executed whoever is current by now, and on a disposed
      // client too. Like the refusal after it, it is made here, before the
      // call path, and `refused` tells a listener of `client.onCall` of a
      // call that sent nothing.
      const earlier = earlierAttempt(this, vars, context, caller !== undefined)
      if (earlier !== undefined) {
        return refused(
          internals,
          fromCanister(retriedWrite(earlier, where), canister as object),
          prepared,
          target,
          record.certified,
          caller,
          vars,
          again
        )
      }
      // A disposed client cancels every call itself (`client_disposed`).
      if (caller === undefined && !internals.disposed()) {
        return refused(
          internals,
          fromCanister(
            createReactorError("cancelled", {
              ...where,
              code: "caller_changed",
              reason: "who started this write is not known; it was not sent",
            }),
            canister as object
          ),
          prepared,
          target,
          record.certified,
          caller,
          vars,
          again
        )
      }
      return invoke(internals, {
        method: prepared,
        target,
        certified: record.certified,
        caller: caller ?? internals.current(),
        values: valuesOf(prepared, vars),
        timeoutMs: timeoutMs ?? record.timeoutMs,
        resend: true,
        canister: canister as object,
        again,
        via: "mutation",
      }).catch((error: unknown) => {
        // Kept for the attempts after it, under the run's context.
        if (key && mayHaveRun(error)) unknownAttempts.set(key, error)
        throw error
      })
    }
    internals.ownMutationFns.add(mutationFn)

    return {
      mutationKey: [
        KEY_ROOT,
        network,
        slotOf(record.resolve()),
        prepared.name,
      ] as const,
      // TanStack runs this first, before mutationFn, and hands what it
      // returns to onSettled. The caller it reads matters only where the
      // client's own `MutationCache` did not read it: on a `QueryClient`
      // other than the client's, and for a run whose mutationFn is the
      // app's own.
      onMutate: (_vars: unknown, context?: unknown): object => {
        const caller = internals.current()
        const run = resolveRun()
        const key = runKey(context)
        if (key !== undefined) {
          prepared.runs.set(key, run)
          if (!internals.mutationCallers.has(key)) {
            internals.mutationCallers.set(key, caller)
          }
        }
        return { [RUN]: run }
      },
      mutationFn,
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
        // context; else those onMutate returned (a call by hand that passes
        // on no context); else the reads resolved now.
        const run = keptRun(context) ?? runIn(onMutateResult) ?? resolveRun()
        const targets = run.invalidates
        if (targets.length === 0) return
        // Every caller's reads, certified or not: a write changes what the
        // canister answers to everyone. On the QueryClient the mutation ran
        // on, which the run's context names, as well as the client's own: an
        // app that nests its own QueryClientProvider keeps its reads there
        // (#903).
        const own = owner().queryClient
        const ran = (runKey(context) as { client?: QueryClient } | undefined)
          ?.client
        const queryClients =
          ran !== undefined && ran !== own ? [own, ran] : [own]
        const filters = {
          predicate: ({ queryKey: key }: { queryKey: QueryKey }) =>
            key[0] === KEY_ROOT &&
            key[1] === network &&
            targets.some(
              ({ slots, method: only }) =>
                slots.includes(key[3] as string) &&
                (only === undefined || key[4] === only)
            ),
        }
        await Promise.all(
          queryClients.map((queryClient) =>
            queryClient.invalidateQueries(filters)
          )
        )
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
    const record = recordOf(canister, internals, call)
    const prepared = methodOf(record, method, call)
    const { name, args } = prepared
    const dedupedBy = options?.dedupedBy
    if (typeof dedupedBy !== "function") {
      throw new TypeError(
        `[ic-reactor] ${call} needs { dedupedBy: (arg) => key }: what makes ${name} run the same argument at most once, such as an ICRC-1 transfer's created_at_time. ` +
          "A write without one has no safe re-send."
      )
    }
    // Kept only for a write whose outcome is unknown, made on `canister`
    // (`differs` below compares the method).
    const attempt = UNKNOWN_WRITES.get(error as object)
    if (attempt === undefined || attempt.canister !== canister) {
      return undefined
    }
    const { values, caller } = attempt
    const arg = args.length > 1 ? values : values[0]
    if (
      typeof arg !== "object" ||
      arg === null ||
      // The sender, and no one else, may send it again.
      internals.current().principal !== caller.principal ||
      // Only for the method it called, while the argument is what was sent
      // and the canister object still resolves to the canister it went to.
      differs(attempt, prepared, record.resolve(), encodeArgs(args, values)) ||
      (dedupedBy(arg) ?? null) === null
    ) {
      return undefined
    }
    offered.set(arg, attempt)
    const sent = (attempt.encoded as { bytes: Uint8Array }).bytes
    return {
      arg,
      from: caller.principal,
      // A copy on every read: `send()` sends the attempt's own bytes, which
      // nothing outside the client can reach to change.
      get bytes() {
        return sent.slice()
      },
      // The attempt itself: its canister id and the bytes it sent.
      // Marked as a re-send of itself, which it is: a timeout before it
      // goes out keeps its unknown outcome (see `run`).
      send: () =>
        invoke(internals, { ...attempt, again: attempt, via: "direct" }),
    }
  }

  /**
   * The bytes a call of `method` with `vars` sends: the same arity rule and
   * the same encoder as the call path, so they are those bytes, not a second
   * encoding of the value.
   */
  const encode = (canister: unknown, method: unknown, vars: unknown) => {
    const call = "client.encode()"
    const record = recordOf(canister, internals, call)
    const prepared = methodOf(record, method, call)
    const encoded = encodeArgs(prepared.args, valuesOf(prepared, vars))
    if (!encoded.ok) {
      // Marked with the canister, as a call's error is, so that
      // `isReactorError(error, canister, method)` reads its issues.
      throw fromCanister(
        notEncoded(
          { method: prepared.name, canisterId: slotOf(record.resolve()) },
          encoded
        ),
        canister as object
      )
    }
    return encoded.bytes
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
        via: "func",
      })
  }

  /** The latest IC time `time()` returned, which a later time may not undercut. */
  let latestTime = 0n

  /**
   * The IC's time, from a certified `read_state` of the `time` path routed by
   * the canister's subnet, sent by the caller's agent. The certificate's
   * signature is verified against the network's root key; its freshness is
   * not compared with the host clock, which may be the clock that is wrong
   * (as `HttpAgent.syncTime()` reads it), but with the IC times this client
   * read before: see `TIME_SLACK`.
   */
  const time = async (canister: unknown): Promise<bigint> => {
    const record = recordOf(canister, internals, "client.time()")
    const target = record.resolve()
    const method = "read_state"
    if (!target.ok) {
      throw createReactorError("invalid_args", {
        method,
        canisterId: target.slot,
        code: "canister_id_unresolved",
        reason: target.message,
      })
    }
    // A read_state is routed by a canister in a subnet's range, and the
    // management canister is in none: the IC would refuse it.
    if (target.id === MANAGEMENT_CANISTER) {
      throw createReactorError("invalid_args", {
        method,
        canisterId: target.id,
        code: "management_canister",
        reason: "the management canister routes no read_state",
      })
    }
    const where = { method, canisterId: target.id }
    const ms = record.timeoutMs
    let timedOut = false
    // Read once more after a failure another attempt can change. The one
    // this is for: a signed-in caller on a host whose clock is minutes off,
    // whose first read_state the replica refuses for its ingress expiry. The
    // agent has read the IC's time by then, and the second is signed by it.
    const once = () => readTime(where, () => timedOut)
    const read = once().catch((error: unknown) => {
      if (isRetryable(error)) return once()
      throw error
    })
    if (ms === undefined) return read
    // The canister object's timeoutMs bounds the wait from here, as it bounds
    // a call through it: when it passes, the time rejects `cancelled` (code
    // `timeout`), and a read_state not sent yet is never sent. One already
    // out goes on, but nobody waits for it.
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        reject(timedOutError(where, false))
      }, ms)
    })
    try {
      return await Promise.race([read, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * The IC's time, read for `client.time()`. `timedOut` says whether its
   * bound passed while the caller's agent was awaited: nothing is sent then.
   */
  const readTime = async (
    where: { readonly method: string; readonly canisterId: string },
    timedOut: () => boolean
  ): Promise<bigint> => {
    const agent = await internals.agentFor(internals.current().principal, where)
    // As in the call path: a dispose() in the microtask after agentFor's own
    // check still sends nothing.
    if (internals.disposed()) {
      throw createReactorError("cancelled", {
        ...where,
        code: "client_disposed",
        reason: "the client was disposed before the time was read",
      })
    }
    if (timedOut()) throw timedOutError(where, false)
    const synced = agent.hasSyncedTime()
    try {
      // The agent verifies the certificate against the network's root key
      // and the canister's subnet delegation. Its age is not checked: that
      // would compare it with the host's clock, the clock this replaces, and
      // a host clock out by minutes would first make the agent re-sync.
      const { verifiedCertificate } = await agent.readState(
        { canisterId: Principal.fromText(where.canisterId) },
        { paths: [TIME_PATH], disableTimeVerification: true }
      )
      const raw = lookupResultToBuffer(
        verifiedCertificate.lookup_path(TIME_PATH)
      )
      if (raw === undefined) {
        throw new Error("the certificate holds no time")
      }
      // A node can answer with an old certificate, which still verifies:
      // stamped with its time, a transfer is a duplicate of an earlier one,
      // or too old for the ledger.
      const now = readLeb128(raw)
      if (now < latestTime - TIME_SLACK) {
        throw new Error(
          "the certificate's time is more than five minutes before one this client read already"
        )
      }
      if (now > latestTime) latestTime = now
      return now
    } catch (error) {
      await resync(agent, synced, where.canisterId, error)
      throw classifyError(error, { ...where, mode: "query" })
    }
  }

  return {
    canister: canisterFactory(internals),
    time,
    queryKey,
    queryOptions,
    mutationOptions,
    resendOf,
    encode,
    func,
  } as unknown as Builders
}
