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

const FACTORY_KEY_ARGS_QUERY_KEY = "__ic_reactor_factory_key_args"

type SuspenseInfiniteFactoryCallOptions = {
  queryKey?: QueryKey
}

type SuspenseInfiniteQueryFactoryFn<
  A,
  M extends FunctionName<A>,
  T extends TransformKey,
  TPageParam,
  TSelected,
> = {
  (
    getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>
  ): SuspenseInfiniteQueryResult<
    SuspenseInfiniteQueryPageData<A, M, T>,
    TPageParam,
    TSelected,
    SuspenseInfiniteQueryError<A, M, T>
  >
  (
    getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>,
    options?: SuspenseInfiniteFactoryCallOptions
  ): SuspenseInfiniteQueryResult<
    SuspenseInfiniteQueryPageData<A, M, T>,
    TPageParam,
    TSelected,
    SuspenseInfiniteQueryError<A, M, T>
  >
}

const mergeFactoryQueryKey = (
  baseQueryKey?: QueryKey,
  callQueryKey?: QueryKey,
  keyArgs?: unknown
): QueryKey | undefined => {
  const merged: unknown[] = []

  if (baseQueryKey) {
    merged.push(...baseQueryKey)
  }
  if (callQueryKey) {
    merged.push(...callQueryKey)
  }
  if (keyArgs !== undefined) {
    merged.push({ [FACTORY_KEY_ARGS_QUERY_KEY]: keyArgs })
  }

  return merged.length > 0 ? merged : undefined
}

// ============================================================================
// Type Definitions
// ============================================================================

/** The raw page data type returned by the query function */
export type SuspenseInfiniteQueryPageData<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = ReactorReturnOk<A, M, T>

/** The error type for infinite queries */
export type SuspenseInfiniteQueryError<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = ReactorReturnErr<A, M, T>

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for createActorSuspenseInfiniteQuery.
 * Extends InfiniteQueryObserverOptions to accept all React Query options at the create level.
 *
 * @template A - The actor interface type
 * @template M - The method name on the actor
 * @template T - The transformation key (identity, display, etc.)
 * @template TPageParam - The type of the page parameter
 * @template TSelected - The type returned after select transformation
 */
export interface SuspenseInfiniteQueryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<SuspenseInfiniteQueryPageData<A, M, T>, TPageParam>,
> extends Omit<
  InfiniteQueryObserverOptions<
    SuspenseInfiniteQueryPageData<A, M, T>,
    SuspenseInfiniteQueryError<A, M, T>,
    TSelected,
    QueryKey,
    TPageParam
  >,
  "queryKey" | "queryFn"
> {
  /** The method to call on the canister */
  functionName: M
  /** Call configuration for the actor method */
  callConfig?: CallConfig
  /** Custom query key (optional, auto-generated if not provided) */
  queryKey?: QueryKey
  /** Function to get args from page parameter */
  getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>
}

/**
 * Configuration for createActorSuspenseInfiniteQueryFactory (without getArgs; provided at call time).
 */
export type SuspenseInfiniteQueryFactoryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<SuspenseInfiniteQueryPageData<A, M, T>, TPageParam>,
> = Omit<
  SuspenseInfiniteQueryConfig<A, M, T, TPageParam, TSelected>,
  "getArgs"
> & {
  /**
   * Optional key-args derivation for factory calls.
   * Receives the resolved args from `getArgs(initialPageParam)` and should return
   * a stable serializable representation of the logical query identity
   * (typically excluding pagination/cursor fields).
   */
  getKeyArgs?: (args: ReactorArgs<A, M, T>) => unknown
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
  TSelected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  // Overload 1: Without select - returns TSelected
  (
    options?: Omit<
      UseSuspenseInfiniteQueryOptions<
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
  ): UseSuspenseInfiniteQueryResult<TSelected, TError>

  // Overload 2: With select - chains on top and returns TFinal
  <TFinal = TSelected>(
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
      select: (data: TSelected) => TFinal
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
 * @template TSelected - The type after select transformation
 * @template TError - The error type
 */
export interface SuspenseInfiniteQueryResult<
  TPageData,
  TPageParam,
  TSelected = InfiniteData<TPageData, TPageParam>,
  TError = Error,
> {
  /** Fetch first page in loader (uses ensureInfiniteQueryData for cache-first) */
  fetch: () => Promise<TSelected>

  /** React hook for components - supports pagination */
  useSuspenseInfiniteQuery: UseSuspenseInfiniteQueryWithSelect<
    TPageData,
    TPageParam,
    TSelected,
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
    (): TSelected | undefined
    <TFinal>(select: (data: TSelected) => TFinal): TFinal | undefined
  }
}

// ============================================================================
// Internal Implementation
// ============================================================================

const createSuspenseInfiniteQueryImpl = <
  A,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<SuspenseInfiniteQueryPageData<A, M, T>, TPageParam>,
>(
  reactor: Reactor<A, T>,
  config: SuspenseInfiniteQueryConfig<A, M, T, TPageParam, TSelected>
): SuspenseInfiniteQueryResult<
  SuspenseInfiniteQueryPageData<A, M, T>,
  TPageParam,
  TSelected,
  SuspenseInfiniteQueryError<A, M, T>
> => {
  type TPageData = SuspenseInfiniteQueryPageData<A, M, T>
  type TError = SuspenseInfiniteQueryError<A, M, T>
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
    staleTime,
  })

  // Fetch function for loaders (cache-first, fetches first page)
  const fetch = async (): Promise<TSelected> => {
    // Use ensureInfiniteQueryData to get cached data or fetch if stale
    const result = await reactor.queryClient.ensureInfiniteQueryData(
      getInfiniteQueryOptions()
    )

    // Result is already InfiniteData format
    return select ? select(result) : (result as unknown as TSelected)
  }

  // Implementation
  const useSuspenseInfiniteQueryHook: UseSuspenseInfiniteQueryWithSelect<
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
  const getCacheData = (selectFn?: (data: TSelected) => any) => {
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
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TPageParam = unknown,
  TSelected = InfiniteData<SuspenseInfiniteQueryPageData<A, M, T>, TPageParam>,
>(
  reactor: Reactor<A, T>,
  config: SuspenseInfiniteQueryConfig<NoInfer<A>, M, T, TPageParam, TSelected>
): SuspenseInfiniteQueryResult<
  SuspenseInfiniteQueryPageData<A, M, T>,
  TPageParam,
  TSelected,
  SuspenseInfiniteQueryError<A, M, T>
> {
  return createSuspenseInfiniteQueryImpl(
    reactor,
    config as SuspenseInfiniteQueryConfig<A, M, T, TPageParam, TSelected>
  )
}

// ============================================================================
// Factory with Dynamic Args
// ============================================================================

/**
 * Create a suspense infinite query factory that accepts getArgs at call time.
 * Useful when pagination logic varies by context.
 *
 * @template A - The actor interface type
 * @template M - The method name on the actor
 * @template T - The transformation key (identity, display, etc.)
 * @template TPageParam - The page parameter type
 * @template TSelected - The type returned after select transformation
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
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
  TPageParam = unknown,
  TSelected = InfiniteData<SuspenseInfiniteQueryPageData<A, M, T>, TPageParam>,
>(
  reactor: Reactor<A, T>,
  config: SuspenseInfiniteQueryFactoryConfig<
    NoInfer<A>,
    M,
    T,
    TPageParam,
    TSelected
  >
): SuspenseInfiniteQueryFactoryFn<A, M, T, TPageParam, TSelected> {
  const factory: SuspenseInfiniteQueryFactoryFn<
    A,
    M,
    T,
    TPageParam,
    TSelected
  > = (
    getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>,
    options?: SuspenseInfiniteFactoryCallOptions
  ) => {
    const initialArgs = getArgs(config.initialPageParam)
    const keyArgs = config.getKeyArgs?.(initialArgs) ?? initialArgs
    const queryKey = mergeFactoryQueryKey(
      config.queryKey,
      options?.queryKey,
      keyArgs
    )

    return createSuspenseInfiniteQueryImpl<A, M, T, TPageParam, TSelected>(
      reactor,
      {
        ...(({ getKeyArgs: _getKeyArgs, ...rest }) => rest)(
          config as SuspenseInfiniteQueryFactoryConfig<
            A,
            M,
            T,
            TPageParam,
            TSelected
          >
        ),
        queryKey,
        getArgs,
      } as SuspenseInfiniteQueryConfig<A, M, T, TPageParam, TSelected>
    )
  }

  return factory
}
