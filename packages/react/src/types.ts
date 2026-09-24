/**
 * Shared type definitions for query factories (createQuery, createSuspenseQuery, etc.)
 */

import type {
  FunctionName,
  ReactorReturnOk,
  ReactorQueryData,
  ReactorReturnErr,
  ReactorArgs,
  BaseActor,
  TransformKey,
  TransformReturnRegistry,
  ErrResult,
  ActorMethodReturnType,
} from "@ic-reactor/core"
import { CanisterError } from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"
import {
  QueryKey,
  QueryObserverOptions,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
  UseMutationOptions,
  UseMutationResult,
} from "@tanstack/react-query"

// ============================================================================
// Utility Types
// ============================================================================

// NoInfer prevents TypeScript from inferring a type parameter from a particular position
// This is available in TypeScript 5.4+ natively, but we define it for compatibility
export type NoInfer<T> = [T][T extends any ? 0 : never]
// ============================================================================
// Base Query Data Types
// ============================================================================

/** The raw data type returned by the query function (before select) */
export type QueryFnData<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>

/** The error type for queries */
export type QueryError<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = ReactorReturnErr<Service, Method, Transform>

// ============================================================================
// Base Query Configuration
// ============================================================================

/**
 * Base configuration for query wrappers (shared between regular and suspense).
 *
 * @template Service - The actor interface type
 * @template Method - The method name on the actor
 * @template Transform - The transformation key (identity, display, etc.)
 * @template Selected - The type returned after select transformation
 */
export interface BaseQueryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
> extends Omit<
  QueryObserverOptions<
    QueryFnData<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    Selected,
    QueryFnData<Service, Method, Transform>,
    QueryKey
  >,
  "queryFn" | "queryKey"
> {
  /** The method to call on the canister */
  functionName: Method
  /** Arguments to pass to the method (if any) */
  args?: ReactorArgs<Service, Method, Transform>
  /** The query key to use for this query */
  queryKey?: QueryKey
  /**
   * How long data stays fresh before refetching, in milliseconds.
   *
   * `createQuery`, `createSuspenseQuery` and their factories default to 5
   * minutes. The bound `useActorQuery` and `useActorSuspenseQuery` hooks (from
   * `createActorHooks` or `defineReactor`) set no default and leave it to
   * TanStack Query, which reads the QueryClient's
   * `defaultOptions.queries.staleTime`. With that unset too, `useActorQuery`
   * uses 0 and `useActorSuspenseQuery` uses 1 second, TanStack Query's
   * fallback for suspense queries.
   */
  staleTime?: number
  /** Transform the raw result before returning */
  select?: (data: QueryFnData<Service, Method, Transform>) => Selected
}

/**
 * Configuration for createQuery (regular useQuery).
 * Alias for BaseQueryConfig for clarity.
 */
export type QueryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
> = BaseQueryConfig<Service, Method, Transform, Selected>

/**
 * Configuration for createSuspenseQuery (useSuspenseQuery).
 * Alias for BaseQueryConfig for clarity.
 */
export type SuspenseQueryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
> = BaseQueryConfig<Service, Method, Transform, Selected>

// ============================================================================
// Factory Configuration (without args)
// ============================================================================

/**
 * Configuration for createQueryFactory (args are provided at call time).
 */
export type QueryFactoryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
> = Omit<QueryConfig<Service, Method, Transform, Selected>, "args">

/**
 * Configuration for createSuspenseQueryFactory (args are provided at call time).
 */
export type SuspenseQueryFactoryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = QueryFnData<Service, Method, Transform>,
> = Omit<SuspenseQueryConfig<Service, Method, Transform, Selected>, "args">

// ============================================================================
// Hook Interfaces with Chained Select Support
// ============================================================================

/**
 * useQuery hook with chained select support.
 * - Without select: returns TSelected (from config.select)
 * - With select: chains on top and returns TFinal
 *
 * Accepts all useQuery options from React Query documentation.
 * Select is special: it chains on top of config.select.
 */
export interface UseQueryWithSelect<
  TQueryFnData,
  TSelected = TQueryFnData,
  TError = Error,
> {
  // Overload 1: Without select - returns TSelected
  // Note: select is included as optional (never type) to enable autocomplete suggestions
  (
    options?: Omit<
      UseQueryOptions<TQueryFnData, TError, TSelected>,
      "queryKey" | "queryFn"
    > & {
      select?: undefined
    }
  ): UseQueryResult<TSelected, TError>

  // Overload 2: With select - chains on top of config.select and returns TFinal
  <TFinal = TSelected>(
    options: Omit<
      UseQueryOptions<TQueryFnData, TError, TFinal>,
      "queryKey" | "queryFn" | "select"
    > & {
      select: (data: TSelected) => TFinal
    }
  ): UseQueryResult<TFinal, TError>
}

/**
 * useSuspenseQuery hook with chained select support.
 * - Without select: returns TSelected (from config.select)
 * - With select: chains on top and returns TFinal
 *
 * Accepts all useSuspenseQuery options from React Query documentation.
 * Select is special: it chains on top of config.select.
 * Data is always defined (never undefined).
 * Does NOT support `enabled` option.
 */
export interface UseSuspenseQueryWithSelect<
  TQueryFnData,
  TSelected = TQueryFnData,
  TError = Error,
> {
  // Overload 1: Without select - returns TSelected
  // Note: select is included as optional (never type) to enable autocomplete suggestions
  (
    options?: Omit<
      UseSuspenseQueryOptions<TQueryFnData, TError, TSelected>,
      "queryKey" | "queryFn"
    > & {
      select?: undefined
    }
  ): UseSuspenseQueryResult<TSelected, TError>

  // Overload 2: With select - chains on top of config.select and returns TFinal
  <TFinal = TSelected>(
    options: Omit<
      UseSuspenseQueryOptions<TQueryFnData, TError, TFinal>,
      "queryKey" | "queryFn" | "select"
    > & {
      select: (data: TSelected) => TFinal
    }
  ): UseSuspenseQueryResult<TFinal, TError>
}

// ============================================================================
// Cache Controls
// ============================================================================

/**
 * What `optimisticUpdate()` resolves with: the way back to the value the
 * cache held before the update.
 *
 * @example
 * ```typescript
 * const update = await postQuery.optimisticUpdate((post) => ({
 *   ...post,
 *   likes: post.likes + 1n,
 * }))
 * // The call failed: show the post as it was
 * update.rollback()
 * ```
 */
export interface OptimisticRollback {
  /**
   * Write back the value the cache held before the update, with the time it
   * was fetched, so it is as fresh or as stale as it was. A value that was
   * invalidated is invalidated again, so a mounted query refetches it, as
   * the refetch the update cancelled would have.
   *
   * It does nothing when the update wrote nothing, or when another principal
   * has signed in or out since: the value was the previous principal's, and
   * the sign-in has already removed or refetched it. It restores that value
   * even if a fetch or another update has written since; invalidate the
   * query afterwards when the canister's current value matters.
   */
  rollback: () => void
}

/**
 * The operations every query object has on its own cache entry, on the
 * reactor's QueryClient. They act on that one entry: other args of the same
 * method, and other queries under the same key prefix, are left alone.
 *
 * @template TQueryFnData - The raw (pre-`select`) data the entry holds
 */
export interface QueryCacheControls<TQueryFnData> {
  /**
   * Cancel this query's fetch in flight, if there is one. The entry keeps
   * the value it held before that fetch started, and a later refetch runs as
   * usual.
   *
   * @example
   * ```typescript
   * // Before writing to the cache, so an older answer cannot land on top
   * await postQuery.cancel()
   * postQuery.setData(draft)
   * ```
   */
  cancel: () => Promise<void>

  /**
   * Reset this query's entry to its initial state, as TanStack Query's
   * `resetQueries` does: its data is cleared, or goes back to `initialData`
   * when one was given. A mounted hook then fetches it again, and a suspense
   * hook suspends until it has. It resolves once that fetch settles.
   *
   * @example
   * ```typescript
   * // A reload button that shows the Suspense fallback again
   * <button onClick={() => void statsQuery.reset()}>Reload</button>
   * ```
   */
  reset: () => Promise<void>

  /**
   * Replace this query's cached value for the duration of a mutation, and
   * get back a rollback for when it fails.
   *
   * It cancels the query's fetch in flight, so an answer from before the
   * mutation cannot overwrite the new value, then writes what `updater`
   * returns for the cached value. `updater` gets and returns the raw,
   * pre-`select` data. When nothing is cached yet it is not called, nothing
   * is cancelled or written, and `rollback()` does nothing: there is no
   * value on screen to update, and the query's own fetch will bring one. The
   * same goes when another principal signs in or out while it cancels, since
   * the cached value is then the previous principal's.
   *
   * The fetch it cancels may be a refetch an invalidation or a sign-in
   * started, so refetch the query once the mutation settles, with
   * `invalidate()` in `onSettled` or the query in `invalidateQueries`.
   *
   * Return it from `onMutate`, so the rollback reaches `onError`.
   *
   * @param updater - The new value, from the cached one. Do not mutate the
   * cached value in place; return a new one.
   *
   * @example
   * ```typescript
   * const getPost = createQueryFactory(backend, { functionName: "getPost" })
   * const likePost = createMutation(backend, { functionName: "likePost" })
   *
   * const { mutate } = likePost.useMutation({
   *   onMutate: ([postId]) =>
   *     getPost([postId]).optimisticUpdate((post) => ({
   *       ...post,
   *       likes: post.likes + 1n,
   *     })),
   *   onError: (_error, _args, update) => update?.rollback(),
   *   // Refetch either way: a call that failed in transit may still have run
   *   onSettled: (_data, _error, [postId]) => getPost([postId]).invalidate(),
   * })
   * ```
   */
  optimisticUpdate: (
    updater: (old: TQueryFnData) => TQueryFnData
  ) => Promise<OptimisticRollback>
}

// ============================================================================
// Result Interfaces
// ============================================================================

/**
 * Base result interface shared between createQuery and createSuspenseQuery.
 *
 * @template TQueryFnData - The raw data type
 * @template TSelected - The type after select transformation
 * @template TError - The error type
 */
export interface BaseQueryResult<
  TQueryFnData,
  TSelected = TQueryFnData,
  _TError = Error,
> extends QueryCacheControls<TQueryFnData> {
  /** Fetch data in loader (uses ensureQueryData for cache-first) */
  fetch: () => Promise<TSelected>

  /**
   * Eagerly prefetch data into the cache without blocking.
   * Useful for preloading data before navigating to a route.
   *
   * Unlike `fetch()`, this returns a void promise so it can be fire-and-forget.
   *
   * @example
   * // In a route hover handler
   * button.addEventListener("mouseenter", () => userQuery.prefetch())
   */
  prefetch: () => Promise<void>

  /** Invalidate the cache (refetches if query is active) */
  invalidate: () => Promise<void>

  /** Get query key (for advanced React Query usage) */
  getQueryKey: () => QueryKey

  /**
   * Read data directly from cache without fetching.
   * Returns undefined if data is not in cache.
   *
   * @template TFinal - Type returned after optional select transformation
   * @param select - Optional select function to transform cached data further
   * @returns Cached data with select applied, or undefined if not in cache
   *
   * @example
   * // Just get the cached data
   * const user = userQuery.getCacheData()
   *
   * // With additional select transformation
   * const name = userQuery.getCacheData((user) => user.name)
   */
  getCacheData: {
    (): TSelected | undefined
    <TFinal>(select: (data: TSelected) => TFinal): TFinal | undefined
  }

  /**
   * Write raw data directly into the cache (useful for optimistic updates).
   * Accepts a new value or an updater function that receives the current cached raw data.
   *
   * Note: The value is stored as raw (pre-select) data.  Any active `select`
   * transformations are automatically re-applied by React Query on the next render.
   *
   * @example
   * // Optimistic update before a mutation
   * userQuery.setData({ id: "1", name: "Alice" })
   *
   * // Functional update
   * counterQuery.setData((prev) => (prev ?? 0) + 1)
   */
  setData: (
    updater:
      | TQueryFnData
      | ((old: TQueryFnData | undefined) => TQueryFnData | undefined)
  ) => TQueryFnData | undefined
}

/**
 * Result from createQuery
 *
 * Includes useQuery hook that:
 * - Supports `enabled` option for conditional fetching
 * - Data may be `undefined` during loading
 * - Uses regular `useQuery` with manual loading state handling
 *
 * @template TQueryFnData - The raw data type
 * @template TSelected - The type after select transformation
 * @template TError - The error type
 */
export interface QueryResult<
  TQueryFnData,
  TSelected = TQueryFnData,
  TError = Error,
> extends BaseQueryResult<TQueryFnData, TSelected, TError> {
  /** React hook for components - supports chained select and enabled option */
  useQuery: UseQueryWithSelect<TQueryFnData, TSelected, TError>
}

/**
 * Result from createSuspenseQuery
 *
 * Includes useSuspenseQuery hook that:
 * - Requires wrapping in <Suspense> boundary
 * - Data is always defined (no undefined checks)
 * - Does NOT support `enabled` option
 *
 * @template TQueryFnData - The raw data type
 * @template TSelected - The type after select transformation
 * @template TError - The error type
 */
export interface SuspenseQueryResult<
  TQueryFnData,
  TSelected = TQueryFnData,
  TError = Error,
> extends BaseQueryResult<TQueryFnData, TSelected, TError> {
  /** React hook for components - data is always defined (wrap in Suspense) */
  useSuspenseQuery: UseSuspenseQueryWithSelect<TQueryFnData, TSelected, TError>
}

// ============================================================================
// Query Factory Functions
// ============================================================================

/**
 * The members every args-late query factory function carries
 * (`createQueryFactory`, `createSuspenseQueryFactory`,
 * `createInfiniteQueryFactory`, `createSuspenseInfiniteQueryFactory`).
 *
 * A factory makes one query per set of args, so there was no key to name all
 * of them: invalidating a list after a mutation meant keeping the args of each
 * instance around. These address every query the factory returns at once.
 */
export interface QueryFactoryMethods {
  /**
   * The key prefix every query of this factory shares, whatever its args: the
   * canister and the method, plus the reactor's transform segment, and for an
   * infinite factory its `callConfig` and config `queryKey`. TanStack Query
   * matches keys by prefix, so the prefix covers every args instance and
   * every infinite page set. Queries of the same method made elsewhere share
   * it too.
   *
   * @example
   * ```typescript
   * const getBalance = createQueryFactory(ledger, {
   *   functionName: "icrc1_balance_of",
   * })
   *
   * // Every cached balance, whatever the account
   * ledger.queryClient.getQueriesData({ queryKey: getBalance.getQueryKey() })
   * ```
   */
  getQueryKey: () => QueryKey
  /**
   * Invalidate every query of this factory, whatever its args, on the
   * reactor's QueryClient. It resolves once the active ones have refetched; a
   * refetch that fails does not reject it.
   *
   * @example
   * ```typescript
   * // After a transfer, refresh every balance on screen
   * await getBalance.invalidate()
   * ```
   */
  invalidate: () => Promise<void>
}

/**
 * The function `createQueryFactory` and `createSuspenseQueryFactory` return:
 * called with args it returns the query object for them, the same object for
 * the same args, and it also carries {@link QueryFactoryMethods}.
 *
 * @template TArgs - The method's arguments
 * @template TQuery - The query object it returns
 */
export interface QueryFactoryFn<TArgs, TQuery> extends QueryFactoryMethods {
  (args: TArgs): TQuery
}

// ============================================================================
// Invalidation Targets
// ============================================================================

/**
 * Anything that knows the key of its queries: a query object from
 * `createQuery`, `createSuspenseQuery`, `createInfiniteQuery` or
 * `createSuspenseInfiniteQuery` (factory instances included), or a query
 * factory function, whose key covers every query it returns.
 */
export interface QueryKeySource {
  /** The key, or key prefix, of the queries it names. */
  getQueryKey: () => QueryKey
  /**
   * Invalidate those queries on the QueryClient they are cached in.
   * `invalidateQueries` calls it when it is there, so a query of another
   * reactor with a QueryClient of its own is invalidated in that client. The
   * key goes to the mutation's reactor's QueryClient otherwise.
   */
  invalidate?: () => Promise<void>
}

/**
 * A method of the mutation's own reactor, and optionally one set of its
 * arguments: the same shape `Reactor.invalidateQueries` takes. Its key is
 * built by the reactor's `generateQueryKey` when the mutation succeeds, so it
 * follows a `setCanisterId` and carries the reactor's transform segment.
 *
 * Without `args` it names every query of the method, whatever its args,
 * infinite queries included. With `args` it names the queries made with those
 * args by `createQuery`, a query factory or the hooks, and `args: []` names a
 * method without parameters as no `args` does. An infinite query keys its
 * page set by its first page's args in another form, which `args` does not
 * match, and a query sent to another canister through `callConfig` is keyed
 * apart: name either by its query object or key instead.
 *
 * @example
 * ```typescript
 * invalidateQueries: [
 *   { functionName: "get_posts" },
 *   { functionName: "get_post", args: [postId] },
 * ]
 * ```
 */
export type QueryDescriptor<
  Service = BaseActor,
  Transform extends TransformKey = "candid",
> = {
  [Method in FunctionName<Service>]: {
    /** The method whose queries to name */
    functionName: Method
    /** The arguments of the one query to name; omit for every query of the method */
    args?: ReactorArgs<Service, Method, Transform>
  }
}[FunctionName<Service>]

/**
 * One entry of `invalidateQueries`: which queries a successful mutation
 * invalidates.
 *
 * - a query key, as `generateQueryKey` or `getQueryKey()` builds it;
 * - a query object or query factory ({@link QueryKeySource});
 * - a method of the mutation's own reactor, with or without args
 *   ({@link QueryDescriptor});
 * - `undefined`, which is skipped, so `[maybeQuery]` and
 *   `[maybeQuery?.getQueryKey()]` are safe when the query is absent.
 *
 * TanStack Query matches each key by prefix.
 *
 * @example
 * ```typescript
 * createMutation(backend, {
 *   functionName: "create_post",
 *   invalidateQueries: [
 *     postsQuery, // a query object
 *     getPost, // a query factory: every post, whatever its args
 *     { functionName: "get_posts_count" }, // a method of this reactor
 *   ],
 * })
 * ```
 */
export type InvalidationTarget<
  Service = BaseActor,
  Transform extends TransformKey = "candid",
> = QueryKey | QueryKeySource | QueryDescriptor<Service, Transform> | undefined

// ============================================================================
// Actor Mutation Types
// ============================================================================

/**
 * Configuration for createMutation and useActorMutation.
 *
 * @template TOnMutateResult - The value `onMutate` returns, which `onSuccess`,
 * `onError` and `onSettled` receive. TypeScript infers it from `onMutate`.
 */
export interface MutationConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TOnMutateResult = unknown,
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>,
    TOnMutateResult
  >,
  "mutationFn"
> {
  /** The method to call on the canister */
  functionName: Method
  /** Call configuration for the actor method */
  callConfig?: CallConfig
  /**
   * Queries to invalidate upon successful mutation, before `onSuccess` runs.
   * The mutation stays pending until the invalidated queries in use have
   * refetched, so `onSuccess` reads the refetched data.
   *
   * Each entry is a query key, a query object or query factory, or a
   * `{ functionName, args? }` method of this mutation's reactor; see
   * {@link InvalidationTarget}. `undefined` entries are skipped, so
   * `[maybeQuery]` is safe when the optional query object is absent.
   *
   * @example
   * ```typescript
   * invalidateQueries: [getPosts, { functionName: "get_posts_count" }]
   * ```
   */
  invalidateQueries?: InvalidationTarget<Service, Transform>[]
  /**
   * Callback for canister-level business logic errors.
   * Called when the canister returns a Result { Err: E } variant.
   *
   * This is separate from `onError` which handles all errors including
   * network failures, agent errors, etc.
   *
   * @param error - The CanisterError containing the typed error value
   * @param variables - The arguments passed to the mutation
   *
   * @example
   * ```typescript
   * createMutation(reactor, {
   *   functionName: "transfer",
   *   onCanisterError: (error, variables) => {
   *     // error.err contains the typed Err value
   *     // error.code contains the variant key (e.g., "InsufficientFunds")
   *     console.error(`Transfer failed: ${error.code}`, error.err)
   *   },
   * })
   * ```
   */
  onCanisterError?: (
    error: CanisterError<
      TransformReturnRegistry<
        ErrResult<ActorMethodReturnType<Service[Method]>>,
        Service
      >[Transform]
    >,
    variables: ReactorArgs<Service, Method, Transform>
  ) => void
}

/**
 * Configuration for createMutationFactory.
 */
export type MutationFactoryConfig<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TOnMutateResult = unknown,
> = Omit<
  MutationConfig<Service, Method, Transform, TOnMutateResult>,
  "onSuccess"
>

/**
 * Options for useMutation hook.
 * Extends React Query's UseMutationOptions with invalidateQueries support.
 *
 * @template TOnMutateResult - The value `onMutate` returns, which `onSuccess`,
 * `onError` and `onSettled` receive. TypeScript infers it from `onMutate`.
 */
export interface MutationHookOptions<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TOnMutateResult = unknown,
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>,
    TOnMutateResult
  >,
  "mutationFn"
> {
  /**
   * Queries to invalidate upon successful mutation, after the factory's own
   * `invalidateQueries` and before `onSuccess`. Takes the same entries:
   * a query key, a query object or query factory, or a
   * `{ functionName, args? }` method of the mutation's reactor; see
   * {@link InvalidationTarget}.
   *
   * @example
   * const balanceQuery = getIcpBalance([account])
   * useMutation({
   *   invalidateQueries: [balanceQuery],
   * })
   */
  invalidateQueries?: InvalidationTarget<Service, Transform>[]
  /**
   * Callback for canister-level business logic errors.
   * Called when the canister returns a Result { Err: E } variant.
   *
   * @param error - The CanisterError containing the typed error value
   * @param variables - The arguments passed to the mutation
   */
  onCanisterError?: (
    error: CanisterError<
      TransformReturnRegistry<
        ErrResult<ActorMethodReturnType<Service[Method]>>,
        Service
      >[Transform]
    >,
    variables: ReactorArgs<Service, Method, Transform>
  ) => void
}

/**
 * Result from createMutation.
 */
export interface MutationResult<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> {
  /**
   * React hook for the mutation.
   * Accepts options to override/extend the factory config.
   *
   * @example
   * // With invalidateQueries to auto-update balance after transfer
   * const { mutate } = icpTransferMutation.useMutation({
   *   invalidateQueries: [userBalanceQuery], // Auto-invalidate after success!
   * })
   */
  useMutation: <TOnMutateResult = unknown>(
    options?: MutationHookOptions<Service, Method, Transform, TOnMutateResult>
  ) => UseMutationResult<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>,
    TOnMutateResult
  >

  /**
   * Execute the update call outside React. It runs in the QueryClient's
   * MutationCache with the factory's options and callbacks, as `useMutation()`
   * does without hook options. It resolves with the method's result and
   * rejects with the call's error.
   */
  execute: (
    args: ReactorArgs<Service, Method, Transform>
  ) => Promise<ReactorReturnOk<Service, Method, Transform>>
}
