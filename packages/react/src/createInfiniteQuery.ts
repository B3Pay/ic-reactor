/**
 * Infinite Query Factory - Generic wrapper for React Query paginated canister data
 *
 * Creates unified fetch/hook/invalidate functions for any paginated canister method.
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
 * postsQuery.invalidate()
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
  InfiniteQueryObserverOptions,
} from "@tanstack/react-query"
import { CallConfig } from "@icp-sdk/core/agent"
import { NoInfer } from "./types"
import { mergeFactoryQueryKey } from "./utils"

type InfiniteQueryFactoryFn<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey,
  TPageParam,
  Selected,
> = {
  (
    getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>
  ): InfiniteQueryResult<
    InfiniteQueryPageData<Service, Method, Transform>,
    TPageParam,
    Selected,
    InfiniteQueryError<Service, Method, Transform>
  >
}

// ============================================================================
// Type Definitions
// ============================================================================

/** The raw page data type returned by the query function */
export type InfiniteQueryPageData<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = ReactorReturnOk<Service, Method, Transform>

/** The error type for infinite queries */
export type InfiniteQueryError<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = ReactorReturnErr<Service, Method, Transform>

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for createActorInfiniteQuery.
 * Extends InfiniteQueryObserverOptions to accept standard TanStack Query
 * infinite-query options at the create level (e.g. refetchInterval,
 * refetchOnMount, refetchOnWindowFocus, retry, gcTime, networkMode).
 *
 * @template Service - The actor interface type
 * @template Method - The method name on the actor
 * @template Transform - The transformation key (identity, display, etc.)
 * @template TPageParam - The type of the page parameter
 * @template Selected - The type returned after select transformation
 */
export interface InfiniteQueryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    InfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
> extends Omit<
  InfiniteQueryObserverOptions<
    InfiniteQueryPageData<Service, Method, Transform>,
    InfiniteQueryError<Service, Method, Transform>,
    Selected,
    QueryKey,
    TPageParam
  >,
  "queryKey" | "queryFn"
> {
  /** The method to call on the canister */
  functionName: Method
  /** Call configuration for the actor method */
  callConfig?: CallConfig
  /** Custom query key (optional, auto-generated if not provided) */
  queryKey?: QueryKey
  /** Initial page parameter */
  initialPageParam: TPageParam
  /** Function to get args from page parameter */
  getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>
  /** Function to determine next page parameter */
  getNextPageParam: (
    lastPage: InfiniteQueryPageData<Service, Method, Transform>,
    allPages: InfiniteQueryPageData<Service, Method, Transform>[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
  /** Function to determine previous page parameter (for bi-directional) */
  getPreviousPageParam?: (
    firstPage: InfiniteQueryPageData<Service, Method, Transform>,
    allPages: InfiniteQueryPageData<Service, Method, Transform>[],
    firstPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
}

/**
 * Configuration for createActorInfiniteQueryFactory (without initialPageParam, getArgs determined at call time).
 */
export type InfiniteQueryFactoryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    InfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
> = Omit<
  InfiniteQueryConfig<Service, Method, Transform, TPageParam, Selected>,
  "getArgs"
> & {
  /**
   * Optional key-args derivation for factory calls.
   * Receives the resolved args from `getArgs(initialPageParam)` and should return
   * a stable serializable representation of the logical query identity
   * (typically excluding pagination/cursor fields).
   */
  getKeyArgs?: (args: ReactorArgs<Service, Method, Transform>) => unknown
}

// ============================================================================
// Hook Interface
// ============================================================================

/**
 * useInfiniteQuery hook with chained select support.
 */
export interface UseInfiniteQueryWithSelect<
  TPageData,
  TPageParam,
  Selected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  // Overload 1: Without select - returns Selected
  (
    options?: Omit<
      UseInfiniteQueryOptions<
        TPageData,
        TError,
        Selected,
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
  ): UseInfiniteQueryResult<Selected, TError>

  // Overload 2: With select - chains on top and returns TFinal
  <TFinal = Selected>(
    options: Omit<
      UseInfiniteQueryOptions<TPageData, TError, TFinal, QueryKey, TPageParam>,
      | "queryKey"
      | "queryFn"
      | "select"
      | "initialPageParam"
      | "getNextPageParam"
      | "getPreviousPageParam"
    > & {
      select: (data: Selected) => TFinal
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
 * @template Selected - The type after select transformation
 * @template TError - The error type
 */
export interface InfiniteQueryResult<
  TPageData,
  TPageParam,
  Selected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  /** Fetch first page in loader (uses ensureQueryData for cache-first) */
  fetch: () => Promise<Selected>

  /** React hook for components - supports pagination */
  useInfiniteQuery: UseInfiniteQueryWithSelect<
    TPageData,
    TPageParam,
    Selected,
    TError
  >

  /** Invalidate the cache (refetches if query is active) */
  invalidate: () => Promise<void>

  /** Get query key (for advanced React Query usage) */
  getQueryKey: () => QueryKey

  /**
   * Read data directly from cache without fetching.
   * Returns undefined if data is not in cache.
   */
  getCacheData: {
    (): Selected | undefined
    <TFinal>(select: (data: Selected) => TFinal): TFinal | undefined
  }
}

// ============================================================================
// Internal Implementation
// ============================================================================

const createInfiniteQueryImpl = <
  Service,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    InfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
>(
  reactor: Reactor<Service, Transform>,
  config: InfiniteQueryConfig<Service, Method, Transform, TPageParam, Selected>
): InfiniteQueryResult<
  InfiniteQueryPageData<Service, Method, Transform>,
  TPageParam,
  Selected,
  InfiniteQueryError<Service, Method, Transform>
> => {
  type TPageData = InfiniteQueryPageData<Service, Method, Transform>
  type TError = InfiniteQueryError<Service, Method, Transform>
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
    ...rest
  } = config

  // Get query key from actor manager
  const getQueryKey = (): QueryKey => {
    return reactor.generateQueryKey(
      {
        functionName,
        queryKey: customQueryKey,
      },
      callConfig
    )
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
  const fetch = async (): Promise<Selected> => {
    // Check cache first
    const cachedData = reactor.queryClient.getQueryData(getQueryKey()) as
      | TInfiniteData
      | undefined

    if (cachedData !== undefined) {
      return select ? select(cachedData) : (cachedData as Selected)
    }

    // Fetch if not in cache
    const result = await reactor.queryClient.fetchInfiniteQuery(
      getInfiniteQueryOptions()
    )

    // Result is already InfiniteData format
    return select ? select(result) : (result as unknown as Selected)
  }

  // Implementation
  const useInfiniteQueryHook: UseInfiniteQueryWithSelect<
    TPageData,
    TPageParam,
    Selected,
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
        ...rest,
        ...options,
        select: chainedSelect,
      } as any,
      reactor.queryClient
    )
  }

  // Invalidate function
  const invalidate = async (): Promise<void> => {
    const queryKey = getQueryKey()
    await reactor.queryClient.invalidateQueries({ queryKey })
  }

  // Get data from cache without fetching
  const getCacheData: any = (selectFn?: (data: Selected) => any) => {
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
    ) as Selected

    // Apply optional select parameter
    if (selectFn) {
      return selectFn(selectedData)
    }

    return selectedData
  }

  return {
    fetch,
    useInfiniteQuery: useInfiniteQueryHook,
    invalidate,
    getQueryKey,
    getCacheData,
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createInfiniteQuery<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  TPageParam = unknown,
  Selected = InfiniteData<
    InfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
>(
  reactor: Reactor<Service, Transform>,
  config: InfiniteQueryConfig<
    NoInfer<Service>,
    Method,
    Transform,
    TPageParam,
    Selected
  >
): InfiniteQueryResult<
  InfiniteQueryPageData<Service, Method, Transform>,
  TPageParam,
  Selected,
  InfiniteQueryError<Service, Method, Transform>
> {
  return createInfiniteQueryImpl(
    reactor,
    config as InfiniteQueryConfig<
      Service,
      Method,
      Transform,
      TPageParam,
      Selected
    >
  )
}

// ============================================================================
// Factory with Dynamic Args
// ============================================================================

/**
 * Create an infinite query factory that accepts getArgs at call time.
 * Useful when pagination logic varies by context.
 *
 * @template Service - The actor interface type
 * @template Method - The method name on the actor
 * @template Transform - The transformation key (identity, display, etc.)
 * @template TPageParam - The page parameter type
 * @template Selected - The type returned after select transformation
 *
 * @param reactor - The Reactor instance
 * @param config - Infinite query configuration (without getArgs)
 * @returns A function that accepts getArgs and returns an ActorInfiniteQueryResult
 *
 * @example
 * const getPostsQuery = createActorInfiniteQueryFactory(reactor, {
 *   functionName: "get_posts",
 *   initialPageParam: 0,
 *   getKeyArgs: (args) => {
 *     const [{ userId }] = args
 *     return [{ userId }]
 *   },
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 *
 * // Create query with specific args builder
 * const userPostsQuery = getPostsQuery((cursor) => [{ userId, cursor, limit: 10 }])
 * const { data, fetchNextPage } = userPostsQuery.useInfiniteQuery()
 */

export function createInfiniteQueryFactory<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  TPageParam = unknown,
  Selected = InfiniteData<
    InfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
>(
  reactor: Reactor<Service, Transform>,
  config: InfiniteQueryFactoryConfig<
    NoInfer<Service>,
    Method,
    Transform,
    TPageParam,
    Selected
  >
): InfiniteQueryFactoryFn<Service, Method, Transform, TPageParam, Selected> {
  const factory: InfiniteQueryFactoryFn<
    Service,
    Method,
    Transform,
    TPageParam,
    Selected
  > = (
    getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>
  ) => {
    const initialArgs = getArgs(config.initialPageParam)
    const keyArgs = config.getKeyArgs?.(initialArgs) ?? initialArgs
    const queryKey = mergeFactoryQueryKey(config.queryKey, undefined, keyArgs)

    return createInfiniteQueryImpl<
      Service,
      Method,
      Transform,
      TPageParam,
      Selected
    >(reactor, {
      ...(({ getKeyArgs: _getKeyArgs, ...rest }) => rest)(
        config as InfiniteQueryFactoryConfig<
          Service,
          Method,
          Transform,
          TPageParam,
          Selected
        >
      ),
      queryKey,
      getArgs,
    })
  }

  return factory
}
