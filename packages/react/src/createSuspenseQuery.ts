/**
 * Suspense Query Factory - Generic wrapper for React Suspense-based canister data
 *
 * Creates unified fetch/hook/invalidate functions for any canister method.
 * Works with any Reactor instance.
 *
 * Uses `useSuspenseQuery` which:
 * - Requires wrapping in <Suspense> boundary
 * - Data is always defined (no undefined checks)
 * - Does NOT support `enabled` option
 *
 * @example
 * const userQuery = createSuspenseQuery(todoManager, {
 *   functionName: "get_user",
 *   select: (result) => result.user,
 * })
 *
 * // In component (wrap in Suspense)
 * const { data: user } = userQuery.useSuspenseQuery() // data is never undefined!
 */

import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  TransformKey,
} from "@ic-reactor/core"
import { useMemo } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import type {
  QueryFnData,
  QueryError,
  SuspenseQueryConfig,
  UseSuspenseQueryWithSelect,
  SuspenseQueryResult,
  SuspenseQueryFactoryConfig,
  QueryFactoryFn,
  NoInfer,
} from "./types.js"
import {
  buildChainedSelect,
  createBoundedCache,
  mountWhileSuspended,
  pickFetchOptions,
  queryCacheControls,
  retryOption,
  useMountQueryClient,
  withQueryFactoryMethods,
} from "./utils.js"

// ============================================================================
// Internal Implementation
// ============================================================================

const createSuspenseQueryImpl = <
  Service,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: SuspenseQueryConfig<Service, Method, Transform, Selected>
): SuspenseQueryResult<
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

  const getQueryKey = () => reactor.generateQueryKey(params, callConfig)

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
    // Runs again when a sign-in or sign-out cancels it, and never rejects;
    // see `prefetch` in createQuery.
    return reactor.clientManager
      .fetchAcrossIdentitySwitch(() =>
        reactor.queryClient.prefetchQuery({
          ...fetchOptions,
          // An update method's default `retry`; see `Reactor.getQueryRetry`.
          ...retryOption(fetchOptions.retry, baseOptions.retry),
          queryKey: baseOptions.queryKey,
          queryFn: baseOptions.queryFn,
          staleTime,
        })
      )
      .catch(() => undefined)
  }

  const useSuspenseQueryHook: UseSuspenseQueryWithSelect<
    TData,
    Selected,
    TError
  > = (options: any): any => {
    useMountQueryClient(reactor.queryClient)
    const baseOptions = reactor.getQueryOptions(params)
    // Memoized so the observer's select-result cache can hit; see
    // buildChainedSelect. `select` comes from the factory config and is stable.
    const chainedSelect = useMemo(
      () => buildChainedSelect(select, options?.select),
      [options?.select]
    )
    try {
      return useSuspenseQuery(
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
    } catch (thrown) {
      mountWhileSuspended(reactor.queryClient, thrown)
      throw thrown
    }
  }

  const invalidate = async (): Promise<void> => {
    await reactor.queryClient.invalidateQueries({ queryKey: getQueryKey() })
  }

  const getCacheData: SuspenseQueryResult<
    TData,
    Selected,
    TError
  >["getCacheData"] = (selectFn?: (data: Selected) => unknown): any => {
    const raw = reactor.getQueryData(params, callConfig)
    if (raw === undefined) return undefined
    const selected = applySelect(raw)
    return selectFn ? selectFn(selected) : selected
  }

  const setData: SuspenseQueryResult<TData, Selected, TError>["setData"] = (
    updater
  ) => {
    return reactor.queryClient.setQueryData(getQueryKey(), updater as any) as
      TData | undefined
  }

  return {
    fetch,
    prefetch,
    useSuspenseQuery: useSuspenseQueryHook,
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

export function createSuspenseQuery<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: SuspenseQueryConfig<NoInfer<Service>, Method, Transform, Selected>
): SuspenseQueryResult<
  QueryFnData<Service, Method, Transform>,
  Selected,
  QueryError<Service, Method, Transform>
> {
  return createSuspenseQueryImpl(
    reactor,
    config as SuspenseQueryConfig<Service, Method, Transform, Selected>
  )
}

// ============================================================================
// Convenience: Create suspense query with dynamic args
// ============================================================================

/**
 * Create a suspense query factory: a function that takes the method's args
 * and returns the suspense query object for them, the same object for the
 * same args.
 *
 * The function also has `getQueryKey()`, the key prefix every query it
 * returns shares, and `invalidate()`, which invalidates all of them whatever
 * their args. Pass the function itself to a mutation's `invalidateQueries` to
 * refresh every instance after the mutation.
 *
 * @example
 * const getBalance = createSuspenseQueryFactory(ledger, {
 *   functionName: "icrc1_balance_of",
 * })
 *
 * // In a component under <Suspense>
 * const { data } = getBalance([{ owner, subaccount: [] }]).useSuspenseQuery()
 *
 * // Refetch every account's balance
 * await getBalance.invalidate()
 */
export function createSuspenseQueryFactory<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: SuspenseQueryFactoryConfig<
    NoInfer<Service>,
    Method,
    Transform,
    Selected
  >
): QueryFactoryFn<
  ReactorArgs<Service, Method, Transform>,
  SuspenseQueryResult<
    QueryFnData<Service, Method, Transform>,
    Selected,
    QueryError<Service, Method, Transform>
  >
> {
  const cache =
    createBoundedCache<
      SuspenseQueryResult<
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

    const result = createSuspenseQueryImpl<
      Service,
      Method,
      Transform,
      Selected
    >(reactor, {
      ...(config as SuspenseQueryFactoryConfig<
        Service,
        Method,
        Transform,
        Selected
      >),
      args,
    })
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
