/**
 * Query Factory - Generic wrapper for React Query-based canister data
 *
 * Creates unified fetch/hook/invalidate functions for any canister method.
 * Works with any Reactor instance.
 * Use this when the same read operation must work both inside React components
 * and outside React (loaders, actions, services, tests).
 *
 * @example
 * const userQuery = createQuery(todoManager, {
 *   functionName: "get_user",
 *   select: (result) => result.user,
 * })
 *
 * // In component
 * const { data: user } = userQuery.useQuery()
 *
 * @example
 * const userQuery = createQuery(todoManager, { functionName: "get_user", args: ["alice"] })
 *
 * // Outside React (loader/service/script)
 * await userQuery.fetch()
 * const cached = userQuery.getCacheData()
 * await userQuery.invalidate()
 */

import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  TransformKey,
} from "@ic-reactor/core"
import { useMemo } from "react"
import {
  QueryKey,
  useQuery,
  type UseQueryOptions,
  type Updater,
} from "@tanstack/react-query"
import type {
  QueryFnData,
  QueryError,
  QueryConfig,
  UseQueryWithSelect,
  QueryResult,
  QueryFactoryConfig,
  QueryFactoryFn,
  NoInfer,
} from "./types.js"
import {
  buildChainedSelect,
  createBoundedCache,
  pickFetchOptions,
  queryCacheControls,
  retryOption,
  useMountQueryClient,
  withQueryFactoryMethods,
} from "./utils.js"

// ============================================================================
// Internal Implementation
// ============================================================================

const createQueryImpl = <
  Service,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: QueryConfig<Service, Method, Transform, Selected>
): QueryResult<
  QueryFnData<Service, Method, Transform>,
  Selected,
  QueryError<Service, Method, Transform>
> => {
  type TData = QueryFnData<Service, Method, Transform>
  type TError = QueryError<Service, Method, Transform>

  const {
    functionName,
    args,
    callConfig,
    staleTime = 5 * 60 * 1000,
    select,
    queryKey: customQueryKey,
    ...rest
  } = config

  // `callConfig` goes wherever the hooks send it: to the call and into the
  // key, so a query of another canister or agent has an entry of its own.
  const params = { functionName, args, queryKey: customQueryKey, callConfig }

  const getQueryKey = (): QueryKey =>
    reactor.generateQueryKey(params, callConfig)

  // Apply config.select to raw data (shared by fetch, getCacheData, and the hook)
  const applySelect = (raw: TData): Selected =>
    select ? select(raw) : (raw as unknown as Selected)

  // How the query function runs, shared with the hook; see pickFetchOptions.
  const fetchOptions = pickFetchOptions(rest)

  /** Cache-first fetch for use in loaders / route preloading. */
  const fetch = async (): Promise<Selected> => {
    // Through the reactor rather than straight to the QueryClient: overriding
    // `fetchQuery` in a Reactor subclass is a documented way to add logic to
    // every factory fetch.
    const result = await reactor.fetchQuery(params, fetchOptions)
    return applySelect(result)
  }

  /** Fire-and-forget prefetch — warms the cache without blocking. */
  const prefetch = (): Promise<void> => {
    const baseOptions = reactor.getQueryOptions(params)
    return reactor.queryClient.prefetchQuery({
      ...fetchOptions,
      // An update method's default `retry`; see `Reactor.getQueryRetry`.
      ...retryOption(fetchOptions.retry, baseOptions.retry),
      queryKey: baseOptions.queryKey,
      queryFn: baseOptions.queryFn,
      staleTime,
    })
  }

  // The hook publicly exposes the overloaded UseQueryWithSelect signature.
  // Internally it takes a single broad options object, so we type the
  // implementation explicitly and cast once to the public overloaded type.
  type UseQueryHookOptions = Omit<
    UseQueryOptions<TData, TError, unknown>,
    "queryKey" | "queryFn"
  > & { select?: (data: Selected) => unknown }

  const useQueryHook = ((options?: UseQueryHookOptions) => {
    useMountQueryClient(reactor.queryClient)
    const baseOptions = reactor.getQueryOptions(params)
    // Memoized so the observer's select-result cache can hit; see
    // buildChainedSelect. `select` comes from the factory config and is stable.
    const chainedSelect = useMemo(
      () => buildChainedSelect(select, options?.select),
      [options?.select]
    )
    return useQuery(
      {
        queryKey: baseOptions.queryKey,
        staleTime,
        ...rest,
        ...options,
        queryFn: baseOptions.queryFn,
        select: chainedSelect,
        // The hook's `retry`, else the config's, else an update method's
        // default; see `Reactor.getQueryRetry`.
        ...retryOption(options?.retry ?? rest.retry, baseOptions.retry),
      },
      reactor.queryClient
    )
  }) as UseQueryWithSelect<TData, Selected, TError>

  const invalidate = async (): Promise<void> => {
    await reactor.queryClient.invalidateQueries({ queryKey: getQueryKey() })
  }

  const getCacheData = ((
    selectFn?: (data: Selected) => unknown
  ): Selected | unknown => {
    const raw = reactor.getQueryData(params, callConfig)
    if (raw === undefined) return undefined
    const selected = applySelect(raw)
    return selectFn ? selectFn(selected) : selected
  }) as QueryResult<TData, Selected, TError>["getCacheData"]

  const setData: QueryResult<TData, Selected, TError>["setData"] = (
    updater
  ) => {
    return reactor.queryClient.setQueryData(
      getQueryKey(),
      updater as Updater<TData | undefined, TData | undefined>
    ) as TData | undefined
  }

  return {
    fetch,
    prefetch,
    useQuery: useQueryHook,
    invalidate,
    getQueryKey,
    getCacheData,
    setData,
    ...queryCacheControls<TData>(reactor, getQueryKey),
  }
}

// ============================================================================
// Public Factory Function
// ============================================================================

export function createQuery<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: QueryConfig<NoInfer<Service>, Method, Transform, Selected>
): QueryResult<
  QueryFnData<Service, Method, Transform>,
  Selected,
  QueryError<Service, Method, Transform>
> {
  return createQueryImpl(
    reactor,
    config as QueryConfig<Service, Method, Transform, Selected>
  )
}

// ============================================================================
// Convenience: Create query with dynamic args
// ============================================================================

/**
 * Create a query factory: a function that takes the method's args and returns
 * the query object for them, the same object for the same args.
 *
 * The function also has `getQueryKey()`, the key prefix every query it
 * returns shares, and `invalidate()`, which invalidates all of them whatever
 * their args. Pass the function itself to a mutation's `invalidateQueries` to
 * refresh every instance after the mutation.
 *
 * @example
 * const getBalance = createQueryFactory(ledger, {
 *   functionName: "icrc1_balance_of",
 * })
 *
 * // In a component
 * const { data } = getBalance([{ owner, subaccount: [] }]).useQuery()
 *
 * // Refetch every account's balance after a transfer
 * const transfer = createMutation(ledger, {
 *   functionName: "icrc1_transfer",
 *   invalidateQueries: [getBalance],
 * })
 */
export function createQueryFactory<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: QueryFactoryConfig<NoInfer<Service>, Method, Transform, Selected>
): QueryFactoryFn<
  ReactorArgs<Service, Method, Transform>,
  QueryResult<
    QueryFnData<Service, Method, Transform>,
    Selected,
    QueryError<Service, Method, Transform>
  >
> {
  const cache =
    createBoundedCache<
      QueryResult<
        QueryFnData<Service, Method, Transform>,
        Selected,
        QueryError<Service, Method, Transform>
      >
    >()

  const factory = (args: ReactorArgs<Service, Method, Transform>) => {
    const key = reactor.generateQueryKey(
      { functionName: config.functionName as Method, args },
      config.callConfig
    )
    const cacheKey = JSON.stringify(key)

    const existing = cache.get(cacheKey)
    if (existing) return existing

    const result = createQueryImpl<Service, Method, Transform, Selected>(
      reactor,
      {
        ...config,
        args,
      }
    )
    cache.set(cacheKey, result)
    return result
  }

  // The method's own prefix, at the canister and agent the config's
  // `callConfig` names. A config `queryKey` follows the args segment in every
  // instance's key, so it cannot narrow the prefix.
  return withQueryFactoryMethods(factory, reactor, () =>
    reactor.generateQueryKey(
      { functionName: config.functionName as Method },
      config.callConfig
    )
  )
}
