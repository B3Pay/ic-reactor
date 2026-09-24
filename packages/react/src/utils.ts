/**
 * Shared internal utilities for the query and mutation hooks and factories.
 */

import { useEffect } from "react"
import type { QueryClient, QueryKey } from "@tanstack/react-query"
import type { CallConfig } from "@icp-sdk/core/agent"
import type {
  ClientManager,
  FunctionName,
  Reactor,
  ReactorArgs,
  ReactorQueryData,
  TransformKey,
} from "@ic-reactor/core"
import { generateKey } from "@ic-reactor/core"
import type {
  InvalidationTarget,
  OptimisticRollback,
  QueryCacheControls,
  QueryFactoryMethods,
  QueryKeySource,
} from "./types.js"

/**
 * Keep `queryClient` mounted while the calling component is.
 *
 * `QueryClient.mount()` is what subscribes a client to TanStack's focus and
 * online managers. Those subscriptions refetch stale queries on window focus
 * and on reconnect, resume a fetch that started offline or a retry that paused
 * while the tab was hidden, and resume mutations sent offline.
 * `QueryClientProvider` normally calls it, but every hook here binds to its
 * reactor's own client rather than the context one, and the setup guide calls
 * the provider optional. Without one, nothing mounted the client: a query that
 * started offline stayed `paused` after the connection came back, a mutation
 * sent offline stayed pending, and `refetchOnWindowFocus` and
 * `refetchOnReconnect` never fired.
 *
 * `mount()` and `unmount()` are reference-counted, so this composes with a
 * provider mounting the same client and with any number of hooks. It runs in
 * an effect, like the provider's, so a server render never subscribes.
 *
 * A reactor stand-in without a `queryClient` (a test double, say) makes the
 * TanStack hooks fall back to the context client, which its provider mounts,
 * so there is nothing to do for one.
 */
export function useMountQueryClient(
  queryClient: QueryClient | undefined
): void {
  useEffect(() => {
    if (!queryClient) return
    queryClient.mount()
    return () => queryClient.unmount()
  }, [queryClient])
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null | undefined)?.then === "function"

/**
 * Keep `queryClient` mounted while a suspense hook waits on the promise it
 * threw. Call it from a `catch` around the TanStack suspense hook, then
 * rethrow. The `try` only lets the hook see the promise: it is rethrown
 * untouched, so React discards the render as before and hook order is kept.
 *
 * A suspense hook throws its fetch promise before its component commits, so
 * the effect in {@link useMountQueryClient} cannot run until that promise
 * settles. A fetch that started offline, or whose retry is waiting for a hidden
 * tab to come back, settles only once a mounted client hears the connection or
 * the focus return. Without a provider nothing had mounted the client, so the
 * Suspense fallback stayed up after reconnecting.
 *
 * The mount taken here is released when the promise settles, whether or not
 * anything ever commits, so it stays balanced: each suspended render, a
 * StrictMode double render or a retry included, takes and releases its own
 * reference. Once the component commits, its effect holds the client like any
 * other hook's. A tree discarded while suspended lets go once its fetch
 * finishes, which it does on reconnect, as it would under a mounted provider.
 * A server render never subscribes.
 */
export function mountWhileSuspended(
  queryClient: QueryClient | undefined,
  thrown: unknown
): void {
  if (!queryClient || typeof window === "undefined" || !isThenable(thrown)) {
    return
  }
  queryClient.mount()
  const release = () => queryClient.unmount()
  void thrown.then(release, release)
}

/**
 * Internal query-key segment used to distinguish per-call factory args
 * from the base query key. Not part of the public API.
 */
export const FACTORY_KEY_ARGS_QUERY_KEY = "__ic_reactor_factory_key_args"

/**
 * The call config an infinite query's function fetches with: the caller's,
 * aimed at the canister its query key names unless the caller named one.
 *
 * The key is built from the reactor's canister when the query is set up, but
 * the query function reached `callMethod`, which reads `reactor.canisterId`
 * again whenever it runs. After a `setCanisterId`, a retry or a refetch by an
 * observer that had not re-rendered then fetched the new canister's pages and
 * cached them under the old canister's key. `generateQueryKey` always roots a
 * key at the canister it resolved, so the key says where its pages come from.
 * `Reactor.getQueryOptions` pins its query function the same way.
 */
export function callConfigForKey(
  queryKey: QueryKey,
  callConfig: CallConfig | undefined
): CallConfig | undefined {
  const keyedCanister = queryKey[0]
  if (callConfig?.canisterId || typeof keyedCanister !== "string") {
    return callConfig
  }
  return { ...callConfig, canisterId: keyedCanister }
}

/** Convert a direct reactor result into a value TanStack Query can cache. */
export const normalizeQueryData = <T>(value: T): ReactorQueryData<T> =>
  (value === undefined ? null : value) as ReactorQueryData<T>

/** Config options that decide how a query's function runs. */
const FETCH_OPTION_KEYS = [
  "networkMode",
  "retry",
  "retryDelay",
  "meta",
] as const

type FetchOptionKey = (typeof FETCH_OPTION_KEYS)[number]

/**
 * The part of a factory config that `fetch()` and `prefetch()` pass on.
 *
 * A factory's hook hands its whole config to TanStack Query, but the
 * imperative path used to pass only the key and query function. So a config's
 * `networkMode: "always"` let the hook fetch while `fetch()` stayed paused
 * offline, its `retry` retried in the hook and not in a loader, and its `meta`
 * never reached the QueryCache callbacks for a `fetch()` failure. These four
 * say how the query function runs, so they now apply to both paths.
 *
 * Options that decide what the cache keeps (`gcTime`, `initialData`) or how an
 * observer renders (`select`, `placeholderData`, `enabled`, …) stay with the
 * hook. Unset options are left out rather than passed as `undefined`, which
 * would override the QueryClient's own defaults.
 */
export function pickFetchOptions<Config extends object>(
  config: Config
): Partial<Pick<Config, Extract<keyof Config, FetchOptionKey>>> {
  const picked: Partial<Record<FetchOptionKey, unknown>> = {}
  for (const key of FETCH_OPTION_KEYS) {
    const value = (config as Partial<Record<FetchOptionKey, unknown>>)[key]
    if (value !== undefined) picked[key] = value
  }
  return picked as Partial<Pick<Config, Extract<keyof Config, FetchOptionKey>>>
}

/**
 * The `retry` entry of a query's options: the query's own `retry` when it sets
 * one, otherwise the reactor's default for its method, and no entry when
 * neither is set, so the QueryClient's defaults apply.
 *
 * The default is `Reactor.getQueryRetry`'s: `undefined` for a query method,
 * and for an update method a retry of only the failures that prove the
 * canister never ran the call, since each attempt runs the update again.
 * Spread this after the caller's options. An update method's default then also
 * replaces a `retry: undefined` spread in from them, which would otherwise
 * select TanStack Query's own three retries.
 */
export function retryOption<TRetry, TDefault>(
  ownRetry: TRetry | undefined,
  defaultRetry: TDefault | undefined
): { retry?: TRetry | TDefault } {
  const retry = ownRetry ?? defaultRetry
  return retry === undefined ? {} : { retry }
}

/**
 * Merge a base query key, optional per-call query key, and optional key-args
 * into a single query key array.
 *
 * Used by createInfiniteQueryFactory and createSuspenseInfiniteQueryFactory to
 * ensure each unique set of factory args produces a distinct cache entry.
 */
export function mergeFactoryQueryKey(
  baseQueryKey?: QueryKey,
  callQueryKey?: QueryKey,
  keyArgs?: unknown
): QueryKey | undefined {
  const merged: unknown[] = []

  if (baseQueryKey) merged.push(...baseQueryKey)
  if (callQueryKey) merged.push(...callQueryKey)
  if (keyArgs !== undefined) {
    // Serialize keyArgs through generateKey so BigInt values (and other
    // non-JSON-serializable Candid types such as Principal) are safely
    // converted to strings before React Query hashes the key.
    const safeKeyArgs = generateKey(
      Array.isArray(keyArgs) ? keyArgs : [keyArgs]
    )
    merged.push({ [FACTORY_KEY_ARGS_QUERY_KEY]: safeKeyArgs })
  }

  return merged.length > 0 ? merged : undefined
}

/**
 * Build a chained select that applies the config-level select (if any) and then
 * the hook-level select (if any).
 *
 * Returns the caller's own function untouched when only one of the two is
 * present, and `undefined` when neither is — allocating a wrapper only for the
 * genuinely chained case. Identity matters here: `QueryObserver` memoizes a
 * select result on `options.select === previousSelectFn`, so a wrapper rebuilt
 * on every render defeats that check. The select then re-runs each render, and
 * for a select returning a non-plain value (a `Map`, a `Date`, a `Principal`)
 * `replaceEqualDeep` cannot structurally share the result either, so `data`
 * gets a fresh reference every render and a `useEffect([data])` that sets state
 * becomes an unbounded loop.
 *
 * Callers should still memoize the result, since the chained case allocates.
 */
export function buildChainedSelect<TData, TSelected, TFinal = TSelected>(
  configSelect: ((data: TData) => TSelected) | undefined,
  hookSelect: ((data: TSelected) => TFinal) | undefined
): ((rawData: TData) => TSelected | TFinal) | undefined {
  if (!configSelect) {
    // `hookSelect` receives the raw data when there is no config-level select,
    // matching the previous behaviour.
    return hookSelect as unknown as
      ((rawData: TData) => TSelected | TFinal) | undefined
  }
  if (!hookSelect) return configSelect
  return (rawData: TData) => hookSelect(configSelect(rawData))
}

/**
 * How many memoized query objects an args-late factory keeps.
 *
 * The memo exists so `getBalance(sameArgs)` returns the same object twice; it
 * was unbounded, so an open-ended argument space — a per-principal balance in a
 * long-lived SPA, a search-as-you-type filter, a cursor-keyed list — grew it
 * forever (measured at ~2.9 kB per entry, 55.8 MB for 20k). A few hundred
 * covers any realistic working set while capping the worst case.
 */
const FACTORY_CACHE_LIMIT = 256

/**
 * Smallest useful LRU: a `Map` already iterates in insertion order, so
 * re-inserting on read is enough to track recency.
 *
 * Eviction is safe — it costs memoization, never correctness. A query object is
 * a closure over the reactor and config, so one rebuilt after eviction behaves
 * identically; only its reference identity differs.
 */
export function createBoundedCache<V>(limit: number = FACTORY_CACHE_LIMIT) {
  const entries = new Map<string, V>()

  return {
    get(key: string): V | undefined {
      const value = entries.get(key)
      if (value === undefined) return undefined
      // Touch: move to the most-recent end.
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key: string, value: V): void {
      if (entries.has(key)) entries.delete(key)
      else if (entries.size >= limit) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, value)
    },
    get size(): number {
      return entries.size
    },
  }
}

const isQueryKeySource = (value: object): value is QueryKeySource =>
  typeof (value as Partial<QueryKeySource>).getQueryKey === "function"

/**
 * Invalidate one `invalidateQueries` entry; see {@link invalidateTargets}.
 */
function invalidateTarget<Service, Transform extends TransformKey>(
  reactor: Reactor<Service, Transform>,
  target: InvalidationTarget<Service, Transform> | null
): Promise<void> {
  // React Query reads `{ queryKey: undefined }` as "match everything", so an
  // absent entry would invalidate every query in the client, the app's
  // unrelated non-canister ones included. `null` only comes from untyped code
  // and would do the same.
  if (target == null) return Promise.resolve()
  if (Array.isArray(target)) {
    return reactor.queryClient.invalidateQueries({ queryKey: target })
  }
  if (isQueryKeySource(target)) {
    // A query object or factory invalidates on its own reactor's client, which
    // is not this reactor's when each reactor has a QueryClient of its own.
    return target.invalidate
      ? target.invalidate()
      : reactor.queryClient.invalidateQueries({
          queryKey: target.getQueryKey(),
        })
  }
  // A `{ functionName, args? }` descriptor. Its key is built now rather than
  // when the mutation was set up, so it follows a `setCanisterId`.
  const { functionName, args } = target as {
    functionName: FunctionName<Service>
    args?: ReactorArgs<Service, FunctionName<Service>, Transform>
  }
  // `args: []`, all that a method without parameters takes, names the same
  // queries as no args. Keyed as given, it adds an args segment that a query
  // made without args lacks, and would match none of those.
  const hasArgs = (args as readonly unknown[] | undefined)?.length
  return reactor.queryClient.invalidateQueries({
    queryKey: reactor.generateQueryKey({
      functionName,
      args: hasArgs ? args : undefined,
    }),
  })
}

/**
 * Invalidate every entry of a mutation's `invalidateQueries` in parallel, on
 * behalf of `reactor`, the mutation's own. It resolves once every active
 * query they matched has refetched; a refetch that fails does not reject it,
 * so it cannot turn an update that already ran into a failure.
 *
 * An entry is a query key, a query object or query factory (anything with a
 * `getQueryKey()`), or a `{ functionName, args? }` descriptor, which is keyed
 * by `reactor.generateQueryKey`. `undefined` entries are skipped.
 */
export async function invalidateTargets<
  Service,
  Transform extends TransformKey,
>(
  reactor: Reactor<Service, Transform>,
  targets: readonly InvalidationTarget<Service, Transform>[] | undefined
): Promise<void> {
  if (!targets || targets.length === 0) return
  await Promise.all(targets.map((target) => invalidateTarget(reactor, target)))
}

/**
 * Give an args-late query factory function its {@link QueryFactoryMethods}.
 *
 * `getQueryKey` builds the prefix every query of the factory shares, and is
 * called each time so that it follows a `setCanisterId`.
 */
export function withQueryFactoryMethods<Factory extends object>(
  factory: Factory,
  reactor: { readonly queryClient: QueryClient },
  getQueryKey: () => QueryKey
): Factory & QueryFactoryMethods {
  const methods: QueryFactoryMethods = {
    getQueryKey,
    invalidate: () =>
      reactor.queryClient.invalidateQueries({ queryKey: getQueryKey() }),
  }
  return Object.assign(factory, methods)
}

/** The rollback of an optimistic update that wrote nothing. */
const NOTHING_TO_ROLL_BACK: OptimisticRollback = { rollback: () => {} }

/** What {@link queryCacheControls} reads from a reactor. */
interface CacheOwner {
  readonly queryClient: QueryClient
  readonly clientManager: Pick<ClientManager, "identity">
}

/**
 * The principal whose answers the reactor's cache holds: the one installed on
 * the manager's agent, `undefined` before one is.
 *
 * Query keys carry no principal. `ClientManager.updateAgent` sweeps the cache
 * instead when another principal signs in, removing inactive entries and
 * refetching active ones, so a value read from the cache is this principal's
 * only while it stays installed.
 */
const cachedPrincipal = (reactor: CacheOwner): string | undefined =>
  reactor.clientManager.identity?.getPrincipal().toText()

/**
 * The {@link QueryCacheControls} of a query object: `cancel`, `reset` and
 * `optimisticUpdate` on its own entry of the reactor's QueryClient.
 *
 * They match the key exactly. A query object's key is also the prefix of
 * other entries (a query without args prefixes every args instance of its
 * method), and cancelling or resetting those would reach queries this object
 * does not own. `getQueryKey` is called each time, so the controls follow a
 * `setCanisterId`.
 */
export function queryCacheControls<TQueryFnData>(
  reactor: CacheOwner,
  getQueryKey: () => QueryKey
): QueryCacheControls<TQueryFnData> {
  return {
    cancel: () =>
      reactor.queryClient.cancelQueries({
        queryKey: getQueryKey(),
        exact: true,
      }),

    reset: () =>
      reactor.queryClient.resetQueries({
        queryKey: getQueryKey(),
        exact: true,
      }),

    optimisticUpdate: async (updater) => {
      const { queryClient } = reactor
      const queryKey = getQueryKey()
      // Nothing cached means nothing on screen to update. Cancelling the
      // entry's first fetch would also leave it pending with no data.
      if (queryClient.getQueryData(queryKey) === undefined) {
        return NOTHING_TO_ROLL_BACK
      }
      const principal = cachedPrincipal(reactor)
      // A fetch in flight would otherwise land after the write below with the
      // canister's answer from before the mutation. Cancelling reverts the
      // entry to what it held before that fetch, so it is read afterwards.
      await queryClient.cancelQueries({ queryKey, exact: true })
      // A sign-in or sign-out while that ran left the previous principal's
      // value in the entry until the sweep's refetch lands. An update built
      // on it would show that value to the principal signed in now.
      if (cachedPrincipal(reactor) !== principal) return NOTHING_TO_ROLL_BACK
      const snapshot = queryClient.getQueryState<TQueryFnData>(queryKey)
      if (snapshot?.data === undefined) return NOTHING_TO_ROLL_BACK
      const { data: previous, dataUpdatedAt, isInvalidated } = snapshot
      queryClient.setQueryData<TQueryFnData>(queryKey, updater(previous))
      return {
        rollback: () => {
          // After a switch to another principal, `previous` is the previous
          // principal's value, which the sweep has removed or is refetching.
          // Written back, it would be served to the one signed in now.
          if (cachedPrincipal(reactor) !== principal) return
          // With its own timestamp: written back as new, a value from before
          // the mutation would look freshly fetched and skip the refetches
          // its age calls for.
          queryClient.setQueryData<TQueryFnData>(queryKey, previous, {
            updatedAt: dataUpdatedAt,
          })
          // The write clears the invalidated mark too, and the fetch the
          // update cancelled was often the refetch an invalidation started.
          // Marked again, the value reads as outdated as it was, and a
          // mounted query refetches it.
          if (isInvalidated) {
            void queryClient.invalidateQueries({ queryKey, exact: true })
          }
        },
      }
    },
  }
}
