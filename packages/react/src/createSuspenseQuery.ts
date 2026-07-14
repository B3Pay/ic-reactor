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
    staleTime = 5 * 60 * 1000,
    select,
    queryKey: customQueryKey,
    ...rest
  } = config

  const params = { functionName, args, queryKey: customQueryKey }

  const getQueryKey = () => reactor.generateQueryKey(params)

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

  const useSuspenseQueryHook: UseSuspenseQueryWithSelect<
    TData,
    Selected,
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
    Selected,
    TError
  >["getCacheData"] = (selectFn?: (data: Selected) => unknown): any => {
    const raw = reactor.getQueryData(params)
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
): (
  args: ReactorArgs<Service, Method, Transform>
) => SuspenseQueryResult<
  QueryFnData<Service, Method, Transform>,
  Selected,
  QueryError<Service, Method, Transform>
> {
  const cache = new Map<
    string,
    SuspenseQueryResult<
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
}
