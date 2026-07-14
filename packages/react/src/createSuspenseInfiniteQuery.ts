/**
 * Suspense Infinite Query Factory - Generic wrapper for React Query suspense-based paginated canister data
 *
 * Creates unified fetch/hook/invalidate functions for any paginated canister method.
 * Works with any Reactor instance.
 *
 * Uses `useSuspenseInfiniteQuery` which:
 * - Requires wrapping in <Suspense> boundary
 * - Data is always defined (no undefined checks)
 * - Does NOT support `enabled` or `placeholderData` options
 *
 * @example
 * const postsQuery = createSuspenseInfiniteQuery(reactor, {
 *   functionName: "get_posts",
 *   initialPageParam: 0,
 *   getArgs: (cursor) => [{ cursor, limit: 10 }],
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 *
 * // In component (wrap in Suspense)
 * const { data, fetchNextPage, hasNextPage } = postsQuery.useSuspenseInfiniteQuery()
 *
 * // Flatten all pages
 * const allPosts = data.pages.flatMap(page => page.posts)
 */

import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  BaseActor,
  TransformKey,
  ReactorReturnOk,
  ReactorQueryData,
  ReactorReturnErr,
} from "@ic-reactor/core"
import {
  QueryKey,
  useSuspenseInfiniteQuery,
  InfiniteData,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseInfiniteQueryOptions,
  QueryFunctionContext,
  FetchInfiniteQueryOptions,
  InfiniteQueryObserverOptions,
} from "@tanstack/react-query"
import { CallConfig } from "@icp-sdk/core/agent"
import { NoInfer } from "./types"
import { mergeFactoryQueryKey, normalizeQueryData } from "./utils"

type SuspenseInfiniteFactoryCallOptions = {
  queryKey?: QueryKey
}

type SuspenseInfiniteQueryFactoryFn<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey,
  TPageParam,
  Selected,
> = {
  (
    getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>
  ): SuspenseInfiniteQueryResult<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam,
    Selected,
    SuspenseInfiniteQueryError<Service, Method, Transform>
  >
  (
    getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>,
    options?: SuspenseInfiniteFactoryCallOptions
  ): SuspenseInfiniteQueryResult<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam,
    Selected,
    SuspenseInfiniteQueryError<Service, Method, Transform>
  >
}

// ============================================================================
// Type Definitions
// ============================================================================

/** The raw page data type returned by the query function */
export type SuspenseInfiniteQueryPageData<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>

/** The error type for infinite queries */
export type SuspenseInfiniteQueryError<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = ReactorReturnErr<Service, Method, Transform>

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for createActorSuspenseInfiniteQuery.
 * Extends InfiniteQueryObserverOptions to accept all React Query options at the create level.
 *
 * @template Service - The actor interface type
 * @template Method - The method name on the actor
 * @template Transform - The transformation key (identity, display, etc.)
 * @template TPageParam - The type of the page parameter
 * @template Selected - The type returned after select transformation
 */
export interface SuspenseInfiniteQueryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
> extends Omit<
  InfiniteQueryObserverOptions<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    SuspenseInfiniteQueryError<Service, Method, Transform>,
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
  /** Function to get args from page parameter */
  getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>
}

/**
 * Configuration for createActorSuspenseInfiniteQueryFactory (without getArgs; provided at call time).
 */
export type SuspenseInfiniteQueryFactoryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
> = Omit<
  SuspenseInfiniteQueryConfig<Service, Method, Transform, TPageParam, Selected>,
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
 * useSuspenseInfiniteQuery hook with chained select support.
 */
export interface UseSuspenseInfiniteQueryWithSelect<
  TPageData,
  TPageParam,
  Selected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  // Overload 1: Without select - returns Selected
  (
    options?: Omit<
      UseSuspenseInfiniteQueryOptions<
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
  ): UseSuspenseInfiniteQueryResult<Selected, TError>

  // Overload 2: With select - chains on top and returns TFinal
  <TFinal = Selected>(
    options: Omit<
      UseSuspenseInfiniteQueryOptions<
        TPageData,
        TError,
        TFinal,
        QueryKey,
        TPageParam
      >,
      | "queryKey"
      | "queryFn"
      | "select"
      | "initialPageParam"
      | "getNextPageParam"
      | "getPreviousPageParam"
    > & {
      select: (data: Selected) => TFinal
    }
  ): UseSuspenseInfiniteQueryResult<TFinal, TError>
}

// ============================================================================
// Result Interface
// ============================================================================

/**
 * Result from createActorSuspenseInfiniteQuery
 *
 * @template TPageData - The raw page data type
 * @template TPageParam - The page parameter type
 * @template Selected - The type after select transformation
 * @template TError - The error type
 */
export interface SuspenseInfiniteQueryResult<
  TPageData,
  TPageParam,
  Selected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  /** Fetch first page in loader (uses ensureInfiniteQueryData for cache-first) */
  fetch: () => Promise<Selected>

  /** React hook for components - supports pagination */
  useSuspenseInfiniteQuery: UseSuspenseInfiniteQueryWithSelect<
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

const createSuspenseInfiniteQueryImpl = <
  Service,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
>(
  reactor: Reactor<Service, Transform>,
  config: SuspenseInfiniteQueryConfig<
    Service,
    Method,
    Transform,
    TPageParam,
    Selected
  >
): SuspenseInfiniteQueryResult<
  SuspenseInfiniteQueryPageData<Service, Method, Transform>,
  TPageParam,
  Selected,
  SuspenseInfiniteQueryError<Service, Method, Transform>
> => {
  type TPageData = SuspenseInfiniteQueryPageData<Service, Method, Transform>
  type TError = SuspenseInfiniteQueryError<Service, Method, Transform>
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
    return normalizeQueryData<ReactorReturnOk<Service, Method, Transform>>(
      result as ReactorReturnOk<Service, Method, Transform>
    )
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
    staleTime,
  })

  // Fetch function for loaders (cache-first, fetches first page)
  const fetch = async (): Promise<Selected> => {
    // Use ensureInfiniteQueryData to get cached data or fetch if stale
    const result = await reactor.queryClient.ensureInfiniteQueryData(
      getInfiniteQueryOptions()
    )

    // Result is already InfiniteData format
    return select ? select(result) : (result as unknown as Selected)
  }

  // Implementation
  const useSuspenseInfiniteQueryHook: UseSuspenseInfiniteQueryWithSelect<
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

    return useSuspenseInfiniteQuery(
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
      },
      reactor.queryClient
    )
  }

  // Invalidate function
  const invalidate = async (): Promise<void> => {
    const queryKey = getQueryKey()
    await reactor.queryClient.invalidateQueries({ queryKey })
  }

  // Get data from cache without fetching
  const getCacheData = (selectFn?: (data: Selected) => any) => {
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
    useSuspenseInfiniteQuery: useSuspenseInfiniteQueryHook,
    invalidate,
    getQueryKey,
    getCacheData,
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSuspenseInfiniteQuery<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  TPageParam = unknown,
  Selected = InfiniteData<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
>(
  reactor: Reactor<Service, Transform>,
  config: SuspenseInfiniteQueryConfig<
    NoInfer<Service>,
    Method,
    Transform,
    TPageParam,
    Selected
  >
): SuspenseInfiniteQueryResult<
  SuspenseInfiniteQueryPageData<Service, Method, Transform>,
  TPageParam,
  Selected,
  SuspenseInfiniteQueryError<Service, Method, Transform>
> {
  return createSuspenseInfiniteQueryImpl(
    reactor,
    config as SuspenseInfiniteQueryConfig<
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
 * Create a suspense infinite query factory that accepts getArgs at call time.
 * Useful when pagination logic varies by context.
 *
 * @template Service - The actor interface type
 * @template Method - The method name on the actor
 * @template Transform - The transformation key (identity, display, etc.)
 * @template TPageParam - The page parameter type
 * @template Selected - The type returned after select transformation
 *
 * @param reactor - The Reactor instance
 * @param config - Suspense infinite query configuration (without getArgs)
 * @returns A function that accepts getArgs and returns an SuspenseActorInfiniteQueryResult
 *
 * @example
 * const getPostsQuery = createActorSuspenseInfiniteQueryFactory(reactor, {
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
 * const { data, fetchNextPage } = userPostsQuery.useSuspenseInfiniteQuery()
 *
 * // Optional: append a manual query-key suffix in addition to auto key args
 * const scopedPostsQuery = getPostsQuery(
 *   (cursor) => [{ userId, cursor, limit: 10 }],
 *   { queryKey: ["v2"] }
 * )
 */

export function createSuspenseInfiniteQueryFactory<
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
  TPageParam = unknown,
  Selected = InfiniteData<
    SuspenseInfiniteQueryPageData<Service, Method, Transform>,
    TPageParam
  >,
>(
  reactor: Reactor<Service, Transform>,
  config: SuspenseInfiniteQueryFactoryConfig<
    NoInfer<Service>,
    Method,
    Transform,
    TPageParam,
    Selected
  >
): SuspenseInfiniteQueryFactoryFn<
  Service,
  Method,
  Transform,
  TPageParam,
  Selected
> {
  const factory: SuspenseInfiniteQueryFactoryFn<
    Service,
    Method,
    Transform,
    TPageParam,
    Selected
  > = (
    getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>,
    options?: SuspenseInfiniteFactoryCallOptions
  ) => {
    const initialArgs = getArgs(config.initialPageParam)
    const keyArgs = config.getKeyArgs?.(initialArgs) ?? initialArgs
    const queryKey = mergeFactoryQueryKey(
      config.queryKey,
      options?.queryKey,
      keyArgs
    )

    return createSuspenseInfiniteQueryImpl<
      Service,
      Method,
      Transform,
      TPageParam,
      Selected
    >(reactor, {
      ...(({ getKeyArgs: _getKeyArgs, ...rest }) => rest)(
        config as SuspenseInfiniteQueryFactoryConfig<
          Service,
          Method,
          Transform,
          TPageParam,
          Selected
        >
      ),
      queryKey,
      getArgs,
    } as SuspenseInfiniteQueryConfig<
      Service,
      Method,
      Transform,
      TPageParam,
      Selected
    >)
  }

  return factory
}
