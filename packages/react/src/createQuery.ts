/**
 * Query Factory - Generic wrapper for React Query-based canister data
 *
 * Creates unified fetch/hook/refetch functions for any canister method.
 * Works with any Reactor instance.
 *
 * @example
 * const userQuery = createQuery(todoManager, {
 *   functionName: "get_user",
 *   select: (result) => result.user,
 * })
 *
 * // In component
 * const { data: user } = userQuery.useQuery()
 */

import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  TransformKey,
} from "@ic-reactor/core"
import { QueryKey, useQuery } from "@tanstack/react-query"
import type {
  QueryFnData,
  QueryError,
  QueryConfig,
  UseQueryWithSelect,
  QueryResult,
  QueryFactoryConfig,
  NoInfer,
} from "./types"

// ============================================================================
// Internal Implementation
// ============================================================================

const createQueryImpl = <
  A,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
>(
  reactor: Reactor<A, T>,
  config: QueryConfig<A, M, T, TSelected>
): QueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>> => {
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
  const getQueryKey = (): QueryKey => {
    return reactor.generateQueryKey(params)
  }

  // Fetch function for loaders (cache-first)
  const fetch = async (): Promise<TSelected> => {
    const result = await reactor.fetchQuery(params)
    return select ? select(result) : (result as TSelected)
  }

  // Implementation
  const useQueryHook: UseQueryWithSelect<TData, TSelected, TError> = (
    options: any
  ): any => {
    const baseOptions = reactor.getQueryOptions(params)

    // Chain the selects: raw -> config.select -> options.select
    const chainedSelect = (rawData: TData) => {
      const firstPass = config.select ? config.select(rawData) : rawData
      if (options?.select) {
        return options.select(firstPass)
      }
      return firstPass
    }
    return useQuery(
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
    useQuery: useQueryHook,
    refetch,
    getQueryKey,
    getCacheData,
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQuery<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TSelected = QueryFnData<A, M, T>,
>(
  reactor: Reactor<A, T>,
  config: QueryConfig<NoInfer<A>, M, T, TSelected>
): QueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>> {
  return createQueryImpl(reactor, config as QueryConfig<A, M, T, TSelected>)
}

// ============================================================================
// Convenience: Create query with dynamic args
// ============================================================================

export function createQueryFactory<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TSelected = QueryFnData<A, M, T>,
>(
  reactor: Reactor<A, T>,
  config: QueryFactoryConfig<NoInfer<A>, M, T, TSelected>
): (
  args: ReactorArgs<A, M, T>
) => QueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>> {
  const cache = new Map<
    string,
    QueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>>
  >()

  return (
    args: ReactorArgs<A, M, T>
  ): QueryResult<QueryFnData<A, M, T>, TSelected, QueryError<A, M, T>> => {
    const key = reactor.generateQueryKey({
      functionName: config.functionName as M,
      args,
    })
    const cacheKey = JSON.stringify(key)

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!
    }

    const result = createQueryImpl<A, M, T, TSelected>(reactor, {
      ...config,
      args,
    })

    cache.set(cacheKey, result)

    return result
  }
}
