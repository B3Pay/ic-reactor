/**
 * Query Factory - Generic wrapper for React Query-based canister data
 *
 * Creates unified fetch/hook/invalidate functions for any canister method.
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
import { buildChainedSelect } from "./utils"

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

  const params = { functionName, args, queryKey: customQueryKey }

  const getQueryKey = (): QueryKey => reactor.generateQueryKey(params)

  // Apply config.select to raw data (shared by fetch, getCacheData, and the hook)
  const applySelect = (raw: TData): TSelected =>
    select ? select(raw) : (raw as unknown as TSelected)

  /** Cache-first fetch for use in loaders / route preloading. */
  const fetch = async (): Promise<TSelected> => {
    const result = await reactor.fetchQuery(params)
    return applySelect(result)
  }

  /** Fire-and-forget prefetch — warms the cache without blocking. */
  const prefetch = (): Promise<void> => {
    const baseOptions = reactor.getQueryOptions(params)
    return reactor.queryClient.prefetchQuery({
      queryKey: baseOptions.queryKey,
      queryFn: baseOptions.queryFn,
      staleTime,
    })
  }

  const useQueryHook: UseQueryWithSelect<TData, TSelected, TError> = (
    options: any
  ): any => {
    const baseOptions = reactor.getQueryOptions(params)
    return useQuery(
      {
        queryKey: baseOptions.queryKey,
        staleTime,
        ...rest,
        ...options,
        queryFn: baseOptions.queryFn,
        select: buildChainedSelect(select, options?.select),
      },
      reactor.queryClient
    )
  }

  const invalidate = async (): Promise<void> => {
    await reactor.queryClient.invalidateQueries({ queryKey: getQueryKey() })
  }

  const getCacheData: QueryResult<TData, TSelected, TError>["getCacheData"] = (
    selectFn?: (data: TSelected) => unknown
  ): any => {
    const raw = reactor.getQueryData(params)
    if (raw === undefined) return undefined
    const selected = applySelect(raw)
    return selectFn ? selectFn(selected) : selected
  }

  const setData: QueryResult<TData, TSelected, TError>["setData"] = (
    updater
  ) => {
    return reactor.queryClient.setQueryData(getQueryKey(), updater as any) as
      | TData
      | undefined
  }

  return {
    fetch,
    prefetch,
    useQuery: useQueryHook,
    invalidate,
    getQueryKey,
    getCacheData,
    setData,
  }
}

// ============================================================================
// Public Factory Function
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

  return (args: ReactorArgs<A, M, T>) => {
    const key = reactor.generateQueryKey({
      functionName: config.functionName as M,
      args,
    })
    const cacheKey = JSON.stringify(key)

    const existing = cache.get(cacheKey)
    if (existing) return existing

    const result = createQueryImpl<A, M, T, TSelected>(reactor, {
      ...config,
      args,
    })
    cache.set(cacheKey, result)
    return result
  }
}
