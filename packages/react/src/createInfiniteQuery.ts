/**
 * Infinite Query Factory - Generic wrapper for React Query paginated canister data
 *
 * Creates unified fetch/hook/refetch functions for any paginated canister method.
 * Works with any Reactor instance.
 *
 * @example
 * const postsQuery = createInfiniteQuery(reactor, {
 *   functionName: "get_posts",
 *   initialPageParam: 0,
 *   getArgs: (cursor) => [{ cursor, limit: 10 }],
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 *
 * // In component
 * const { data, fetchNextPage, hasNextPage } = postsQuery.useInfiniteQuery()
 *
 * // Flatten all pages
 * const allPosts = data?.pages.flatMap(page => page.posts)
 *
 * // Invalidate cache
 * postsQuery.refetch()
 */

import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  BaseActor,
  TransformKey,
  ReactorReturnOk,
  ReactorReturnErr,
} from "@ic-reactor/core"
import {
  QueryKey,
  useInfiniteQuery,
  InfiniteData,
  UseInfiniteQueryResult,
  UseInfiniteQueryOptions,
  QueryFunctionContext,
  FetchInfiniteQueryOptions,
} from "@tanstack/react-query"
import { CallConfig } from "@icp-sdk/core/agent"
import { NoInfer } from "./types"

// ============================================================================
// Type Definitions
// ============================================================================

/** The raw page data type returned by the query function */
export type InfiniteQueryPageData<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = ReactorReturnOk<A, M, T>

/** The error type for infinite queries */
export type InfiniteQueryError<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = ReactorReturnErr<A, M, T>

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for createActorInfiniteQuery.
 *
 * @template A - The actor interface type
 * @template M - The method name on the actor
 * @template T - The transformation key (identity, display, etc.)
 * @template TPageParam - The type of the page parameter
 * @template TSelected - The type returned after select transformation
 */
export interface InfiniteQueryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<InfiniteQueryPageData<A, M, T>, TPageParam>,
> {
  /** The method to call on the canister */
  functionName: M
  /** Call configuration for the actor method */
  callConfig?: CallConfig
  /** Custom query key (optional, auto-generated if not provided) */
  queryKey?: QueryKey
  /** Initial page parameter */
  initialPageParam: TPageParam
  /** Function to get args from page parameter */
  getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>
  /** Function to determine next page parameter */
  getNextPageParam: (
    lastPage: InfiniteQueryPageData<A, M, T>,
    allPages: InfiniteQueryPageData<A, M, T>[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
  /** Function to determine previous page parameter (for bi-directional) */
  getPreviousPageParam?: (
    firstPage: InfiniteQueryPageData<A, M, T>,
    allPages: InfiniteQueryPageData<A, M, T>[],
    firstPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
  /** Maximum number of pages to keep in cache */
  maxPages?: number
  /** How long data stays fresh before refetching (default: 5 min) */
  staleTime?: number
  /** Transform the raw InfiniteData result before returning */
  select?: (
    data: InfiniteData<InfiniteQueryPageData<A, M, T>, TPageParam>
  ) => TSelected
}

/**
 * Configuration for createActorInfiniteQueryFactory (without initialPageParam, getArgs determined at call time).
 */
export type InfiniteQueryFactoryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<InfiniteQueryPageData<A, M, T>, TPageParam>,
> = Omit<InfiniteQueryConfig<A, M, T, TPageParam, TSelected>, "getArgs">

// ============================================================================
// Hook Interface
// ============================================================================

/**
 * useInfiniteQuery hook with chained select support.
 */
export interface UseInfiniteQueryWithSelect<
  TPageData,
  TPageParam,
  TSelected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  // Overload 1: Without select - returns TSelected
  (
    options?: Omit<
      UseInfiniteQueryOptions<
        TPageData,
        TError,
        TSelected,
        QueryKey,
        TPageParam
      >,
      | "select"
      | "queryKey"
      | "queryFn"
      | "initialPageParam"
      | "getNextPageParam"
      | "getPreviousPageParam"
    >
  ): UseInfiniteQueryResult<TSelected, TError>

  // Overload 2: With select - chains on top and returns TFinal
  <TFinal = TSelected>(
    options: Omit<
      UseInfiniteQueryOptions<TPageData, TError, TFinal, QueryKey, TPageParam>,
      | "queryKey"
      | "queryFn"
      | "select"
      | "initialPageParam"
      | "getNextPageParam"
      | "getPreviousPageParam"
    > & {
      select: (data: TSelected) => TFinal
    }
  ): UseInfiniteQueryResult<TFinal, TError>
}

// ============================================================================
// Result Interface
// ============================================================================

/**
 * Result from createActorInfiniteQuery
 *
 * @template TPageData - The raw page data type
 * @template TPageParam - The page parameter type
 * @template TSelected - The type after select transformation
 * @template TError - The error type
 */
export interface InfiniteQueryResult<
  TPageData,
  TPageParam,
  TSelected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  /** Fetch first page in loader (uses ensureQueryData for cache-first) */
  fetch: () => Promise<TSelected>

  /** React hook for components - supports pagination */
  useInfiniteQuery: UseInfiniteQueryWithSelect<
    TPageData,
    TPageParam,
    TSelected,
    TError
  >

  /** Invalidate and refetch cache */
  refetch: () => Promise<void>

  /** Get query key (for advanced React Query usage) */
  getQueryKey: () => QueryKey

  /**
   * Read data directly from cache without fetching.
   * Returns undefined if data is not in cache.
   */
  getCacheData: {
    (): TSelected | undefined
    <TFinal>(select: (data: TSelected) => TFinal): TFinal | undefined
  }
}

// ============================================================================
// Internal Implementation
// ============================================================================

const createInfiniteQueryImpl = <
  A,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<InfiniteQueryPageData<A, M, T>, TPageParam>,
>(
  reactor: Reactor<A, T>,
  config: InfiniteQueryConfig<A, M, T, TPageParam, TSelected>
): InfiniteQueryResult<
  InfiniteQueryPageData<A, M, T>,
  TPageParam,
  TSelected,
  InfiniteQueryError<A, M, T>
> => {
  type TPageData = InfiniteQueryPageData<A, M, T>
  type TError = InfiniteQueryError<A, M, T>
  type TInfiniteData = InfiniteData<TPageData, TPageParam>

  const {
    functionName,
    callConfig,
    queryKey: customQueryKey,
    initialPageParam,
    getArgs,
    getNextPageParam,
    getPreviousPageParam,
    maxPages,
    staleTime = 5 * 60 * 1000,
    select,
  } = config

  // Get query key from actor manager
  const getQueryKey = (): QueryKey => {
    return reactor.generateQueryKey({
      functionName,
      queryKey: customQueryKey,
    })
  }

  // Query function - accepts QueryFunctionContext
  const queryFn = async (
    context: QueryFunctionContext<QueryKey, TPageParam>
  ): Promise<TPageData> => {
    // pageParam is typed as unknown in QueryFunctionContext, but we know its type
    const pageParam = context.pageParam as TPageParam
    const args = getArgs(pageParam)
    const result = await reactor.callMethod({
      functionName,
      args,
      callConfig,
    })
    return result
  }

  // Get infinite query options for fetchInfiniteQuery
  const getInfiniteQueryOptions = (): FetchInfiniteQueryOptions<
    TPageData,
    TError,
    TPageData,
    QueryKey,
    TPageParam
  > => ({
    queryKey: getQueryKey(),
    queryFn,
    initialPageParam,
    getNextPageParam,
  })

  // Fetch function for loaders (cache-first, fetches first page)
  const fetch = async (): Promise<TSelected> => {
    // Check cache first
    const cachedData = reactor.queryClient.getQueryData(getQueryKey()) as
      | TInfiniteData
      | undefined

    if (cachedData !== undefined) {
      return select ? select(cachedData) : (cachedData as TSelected)
    }

    // Fetch if not in cache
    const result = await reactor.queryClient.fetchInfiniteQuery(
      getInfiniteQueryOptions()
    )

    // Result is already InfiniteData format
    return select ? select(result) : (result as unknown as TSelected)
  }

  // Implementation
  const useInfiniteQueryHook: UseInfiniteQueryWithSelect<
    TPageData,
    TPageParam,
    TSelected,
    TError
  > = (options: any): any => {
    // Chain the selects: raw -> config.select -> options.select
    const chainedSelect = (rawData: TInfiniteData) => {
      const firstPass = select ? select(rawData) : rawData
      if (options?.select) {
        return options.select(firstPass)
      }
      return firstPass
    }

    return useInfiniteQuery(
      {
        queryKey: getQueryKey(),
        queryFn,
        initialPageParam,
        getNextPageParam,
        getPreviousPageParam,
        maxPages,
        staleTime,
        ...options,
        select: chainedSelect,
      } as any,
      reactor.queryClient
    )
  }

  // Refetch/invalidate function
  const refetch = async (): Promise<void> => {
    const queryKey = getQueryKey()
    await reactor.queryClient.refetchQueries({ queryKey })
  }

  // Get data from cache without fetching
  const getCacheData: any = (selectFn?: (data: TSelected) => any) => {
    const queryKey = getQueryKey()
    const cachedRawData = reactor.queryClient.getQueryData(
      queryKey
    ) as TInfiniteData

    if (cachedRawData === undefined) {
      return undefined
    }

    // Apply config.select to raw cache data
    const selectedData = (
      select ? select(cachedRawData) : cachedRawData
    ) as TSelected

    // Apply optional select parameter
    if (selectFn) {
      return selectFn(selectedData)
    }

    return selectedData
  }

  return {
    fetch,
    useInfiniteQuery: useInfiniteQueryHook,
    refetch,
    getQueryKey,
    getCacheData,
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createInfiniteQuery<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TPageParam = unknown,
  TSelected = InfiniteData<InfiniteQueryPageData<A, M, T>, TPageParam>,
>(
  reactor: Reactor<A, T>,
  config: InfiniteQueryConfig<NoInfer<A>, M, T, TPageParam, TSelected>
): InfiniteQueryResult<
  InfiniteQueryPageData<A, M, T>,
  TPageParam,
  TSelected,
  InfiniteQueryError<A, M, T>
> {
  return createInfiniteQueryImpl(
    reactor,
    config as InfiniteQueryConfig<A, M, T, TPageParam, TSelected>
  )
}

// ============================================================================
// Factory with Dynamic Args
// ============================================================================

/**
 * Create an infinite query factory that accepts getArgs at call time.
 * Useful when pagination logic varies by context.
 *
 * @template A - The actor interface type
 * @template M - The method name on the actor
 * @template T - The transformation key (identity, display, etc.)
 * @template TPageParam - The page parameter type
 * @template TSelected - The type returned after select transformation
 *
 * @param reactor - The Reactor instance
 * @param config - Infinite query configuration (without getArgs)
 * @returns A function that accepts getArgs and returns an ActorInfiniteQueryResult
 *
 * @example
 * const getPostsQuery = createActorInfiniteQueryFactory(reactor, {
 *   functionName: "get_posts",
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 *
 * // Create query with specific args builder
 * const userPostsQuery = getPostsQuery((cursor) => [{ userId, cursor, limit: 10 }])
 * const { data, fetchNextPage } = userPostsQuery.useInfiniteQuery()
 */

export function createInfiniteQueryFactory<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TPageParam = unknown,
  TSelected = InfiniteData<InfiniteQueryPageData<A, M, T>, TPageParam>,
>(
  reactor: Reactor<A, T>,
  config: InfiniteQueryFactoryConfig<NoInfer<A>, M, T, TPageParam, TSelected>
): (
  getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>
) => InfiniteQueryResult<
  InfiniteQueryPageData<A, M, T>,
  TPageParam,
  TSelected,
  InfiniteQueryError<A, M, T>
> {
  return (
    getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>
  ): InfiniteQueryResult<
    InfiniteQueryPageData<A, M, T>,
    TPageParam,
    TSelected,
    InfiniteQueryError<A, M, T>
  > => {
    return createInfiniteQueryImpl<A, M, T, TPageParam, TSelected>(reactor, {
      ...(config as InfiniteQueryFactoryConfig<A, M, T, TPageParam, TSelected>),
      getArgs,
    })
  }
}
