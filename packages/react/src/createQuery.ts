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
  NoInfer,
} from "./types"
import { buildChainedSelect } from "./utils"

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
    staleTime = 5 * 60 * 1000,
    select,
    queryKey: customQueryKey,
    ...rest
  } = config

  const params = { functionName, args, queryKey: customQueryKey }

  const getQueryKey = (): QueryKey => reactor.generateQueryKey(params)

  // Apply config.select to raw data (shared by fetch, getCacheData, and the hook)
  const applySelect = (raw: TData): Selected =>
    select ? select(raw) : (raw as unknown as Selected)

  /** Cache-first fetch for use in loaders / route preloading. */
  const fetch = async (): Promise<Selected> => {
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

  // The hook publicly exposes the overloaded UseQueryWithSelect signature.
  // Internally it takes a single broad options object, so we type the
  // implementation explicitly and cast once to the public overloaded type.
  type UseQueryHookOptions = Omit<
    UseQueryOptions<TData, TError, unknown>,
    "queryKey" | "queryFn"
  > & { select?: (data: Selected) => unknown }

  const useQueryHook = ((options?: UseQueryHookOptions) => {
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
  }) as UseQueryWithSelect<TData, Selected, TError>

  const invalidate = async (): Promise<void> => {
    await reactor.queryClient.invalidateQueries({ queryKey: getQueryKey() })
  }

  const getCacheData = ((
    selectFn?: (data: Selected) => unknown
  ): Selected | unknown => {
    const raw = reactor.getQueryData(params)
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

export function createQueryFactory<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Selected = QueryFnData<Service, Method, Transform>,
>(
  reactor: Reactor<Service, Transform>,
  config: QueryFactoryConfig<NoInfer<Service>, Method, Transform, Selected>
): (
  args: ReactorArgs<Service, Method, Transform>
) => QueryResult<
  QueryFnData<Service, Method, Transform>,
  Selected,
  QueryError<Service, Method, Transform>
> {
  const cache = new Map<
    string,
    QueryResult<
      QueryFnData<Service, Method, Transform>,
      Selected,
      QueryError<Service, Method, Transform>
    >
  >()

  return (args: ReactorArgs<Service, Method, Transform>) => {
    const key = reactor.generateQueryKey({
      functionName: config.functionName as Method,
      args,
    })
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
}
