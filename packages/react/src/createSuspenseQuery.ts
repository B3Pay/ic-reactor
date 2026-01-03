/**
 * Suspense Query Factory - Generic wrapper for React Suspense-based canister data
 *
 * Creates unified fetch/hook/refetch functions for any canister method.
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
import { useSuspenseQuery } from "@tanstack/react-query"
import type {
  QueryFnData,
  QueryError,
  SuspenseQueryConfig,
  UseSuspenseQueryWithSelect,
  SuspenseQueryResult,
  SuspenseQueryFactoryConfig,
  NoInfer,
} from "./types"

// ============================================================================
// Internal Implementation
// ============================================================================

const createSuspenseQueryImpl = <
  A,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
>(
  reactor: Reactor<A, T>,
  config: SuspenseQueryConfig<A, M, T, TSelected>
): SuspenseQueryResult<
  QueryFnData<A, M, T>,
  TSelected,
  QueryError<A, M, T>
> => {
  type TData = QueryFnData<A, M, T>
  type TError = QueryError<A, M, T>

  const {
    functionName,
    args,
    staleTime = 5 * 60 * 1000,
    select,
    queryKey: customQueryKey,
    ...rest
  } = config

  const params = {
    functionName,
    args,
    queryKey: customQueryKey,
  }

  // Get query key from actor manager
  const getQueryKey = () => {
    return reactor.generateQueryKey(params)
  }

  // Fetch function for loaders (cache-first)
  const fetch = async (): Promise<TSelected> => {
    const result = await reactor.fetchQuery(params)
    return select ? select(result) : (result as TSelected)
  }

  // Implementation
  const useSuspenseQueryHook: UseSuspenseQueryWithSelect<
    TData,
    TSelected,
    TError
  > = (options: any): any => {
    const baseOptions = reactor.getQueryOptions(params)

    // Chain the selects: raw -> config.select -> options.select
    const chainedSelect = (rawData: TData) => {
      const firstPass = config.select ? config.select(rawData) : rawData
      if (options?.select) {
        return options.select(firstPass)
      }
      return firstPass
    }
    return useSuspenseQuery(
      {
        queryKey: baseOptions.queryKey,
        staleTime,
        ...rest,
        ...options,
        queryFn: baseOptions.queryFn,
        select: chainedSelect,
      },
      reactor.queryClient
    )
  }

  // Refetch/invalidate function
  const refetch = async (): Promise<void> => {
    const queryKey = getQueryKey()
    await reactor.queryClient.refetchQueries({ queryKey })
  }

  // Get data from cache without fetching
  const getCacheData: any = (selectFn?: (data: TData) => any) => {
    const cachedRawData = reactor.getQueryData(params)

    if (cachedRawData === undefined) {
      return undefined
    }

    // Apply config.select to raw cache data
    const selectedData = (
      config.select ? config.select(cachedRawData) : cachedRawData
    ) as TData

    // Apply optional select parameter
    if (selectFn) {
      return selectFn(selectedData)
    }

    return selectedData
  }

  return {
    fetch,
    useSuspenseQuery: useSuspenseQueryHook,
    refetch,
    getQueryKey,
    getCacheData,
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSuspenseQuery<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TSelected = QueryFnData<A, M, T>,
>(
  reactor: Reactor<A, T>,
  config: SuspenseQueryConfig<NoInfer<A>, M, T, TSelected>
): SuspenseQueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>> {
  return createSuspenseQueryImpl(
    reactor,
    config as SuspenseQueryConfig<A, M, T, TSelected>
  )
}

// ============================================================================
// Convenience: Create suspense query with dynamic args
// ============================================================================

export function createSuspenseQueryFactory<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TSelected = QueryFnData<A, M, T>,
>(
  reactor: Reactor<A, T>,
  config: SuspenseQueryFactoryConfig<NoInfer<A>, M, T, TSelected>
): (
  args: ReactorArgs<A, M, T>
) => SuspenseQueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>> {
  const cache = new Map<
    string,
    SuspenseQueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>>
  >()

  return (
    args: ReactorArgs<A, M, T>
  ): SuspenseQueryResult<
    QueryFnData<A, M, T>,
    TSelected,
    QueryError<A, M, T>
  > => {
    const key = reactor.generateQueryKey({
      functionName: config.functionName as M,
      args,
    })
    const cacheKey = JSON.stringify(key)

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!
    }

    const result = createSuspenseQueryImpl<A, M, T, TSelected>(reactor, {
      ...(config as SuspenseQueryFactoryConfig<A, M, T, TSelected>),
      args,
    })

    cache.set(cacheKey, result)

    return result
  }
}
