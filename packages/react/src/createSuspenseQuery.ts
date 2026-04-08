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
import { buildChainedSelect } from "./utils"

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

  const params = { functionName, args, queryKey: customQueryKey }

  const getQueryKey = () => reactor.generateQueryKey(params)

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

  const useSuspenseQueryHook: UseSuspenseQueryWithSelect<
    TData,
    TSelected,
    TError
  > = (options: any): any => {
    const baseOptions = reactor.getQueryOptions(params)
    return useSuspenseQuery(
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

  const getCacheData: SuspenseQueryResult<
    TData,
    TSelected,
    TError
  >["getCacheData"] = (selectFn?: (data: TSelected) => unknown): any => {
    const raw = reactor.getQueryData(params)
    if (raw === undefined) return undefined
    const selected = applySelect(raw)
    return selectFn ? selectFn(selected) : selected
  }

  const setData: SuspenseQueryResult<TData, TSelected, TError>["setData"] = (
    updater
  ) => {
    return reactor.queryClient.setQueryData(getQueryKey(), updater as any) as
      | TData
      | undefined
  }

  return {
    fetch,
    prefetch,
    useSuspenseQuery: useSuspenseQueryHook,
    invalidate,
    getQueryKey,
    getCacheData,
    setData,
  }
}

// ============================================================================
// Public Factory Function
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

  return (args: ReactorArgs<A, M, T>) => {
    const key = reactor.generateQueryKey({
      functionName: config.functionName as M,
      args,
    })
    const cacheKey = JSON.stringify(key)

    const existing = cache.get(cacheKey)
    if (existing) return existing

    const result = createSuspenseQueryImpl<A, M, T, TSelected>(reactor, {
      ...(config as SuspenseQueryFactoryConfig<A, M, T, TSelected>),
      args,
    })
    cache.set(cacheKey, result)
    return result
  }
}
