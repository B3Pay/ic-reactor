/**
 * Shared type definitions for query factories (createActorQuery, createActorSuspenseQuery, etc.)
 */

import type {
  FunctionName,
  ReactorReturnOk,
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
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = ReactorReturnOk<A, M, T>

/** The error type for queries */
export type QueryError<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = ReactorReturnErr<A, M, T>

// ============================================================================
// Base Query Configuration
// ============================================================================

/**
 * Base configuration for query wrappers (shared between regular and suspense).
 *
 * @template A - The actor interface type
 * @template M - The method name on the actor
 * @template T - The transformation key (identity, display, etc.)
 * @template TSelected - The type returned after select transformation
 */
export interface BaseQueryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
> extends Omit<
  QueryObserverOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    TSelected,
    ReactorReturnOk<A, M, T>,
    QueryKey
  >,
  "queryFn" | "queryKey"
> {
  /** The method to call on the canister */
  functionName: M
  /** Arguments to pass to the method (if any) */
  args?: ReactorArgs<A, M, T>
  /** The query key to use for this query */
  queryKey?: QueryKey
  /** How long data stays fresh before refetching (default: 5 min) */
  staleTime?: number
  /** Transform the raw result before returning */
  select?: (data: QueryFnData<A, M, T>) => TSelected
}

/**
 * Configuration for createQuery (regular useQuery).
 * Alias for BaseQueryConfig for clarity.
 */
export type QueryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
> = BaseQueryConfig<A, M, T, TSelected>

/**
 * Configuration for createSuspenseQuery (useSuspenseQuery).
 * Alias for BaseQueryConfig for clarity.
 */
export type SuspenseQueryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
> = BaseQueryConfig<A, M, T, TSelected>

// ============================================================================
// Factory Configuration (without args)
// ============================================================================

/**
 * Configuration for createQueryFactory (args are provided at call time).
 */
export type QueryFactoryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
> = Omit<QueryConfig<A, M, T, TSelected>, "args">

/**
 * Configuration for createSuspenseQueryFactory (args are provided at call time).
 */
export type SuspenseQueryFactoryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = QueryFnData<A, M, T>,
> = Omit<SuspenseQueryConfig<A, M, T, TSelected>, "args">

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
> {
  /** Fetch data in loader (uses ensureQueryData for cache-first) */
  fetch: () => Promise<TSelected>

  /** Invalidate and refetch cache */
  refetch: () => Promise<void>

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
// Actor Mutation Types
// ============================================================================

/**
 * Configuration for createMutation and useActorMutation.
 */
export interface MutationConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorArgs<A, M, T>
  >,
  "mutationFn"
> {
  /** The method to call on the canister */
  functionName: M
  /** Call configuration for the actor method */
  callConfig?: CallConfig
  /** Queries to refetch upon successful mutation */
  refetchQueries?: QueryKey[]
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
    error: CanisterError<unknown>,
    variables: ReactorArgs<A, M, T>
  ) => void
}

/**
 * Configuration for createMutationFactory.
 */
export type MutationFactoryConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = Omit<MutationConfig<A, M, T>, "onSuccess">

/**
 * Options for useMutation hook.
 * Extends React Query's UseMutationOptions with refetchQueries support.
 */
export interface MutationHookOptions<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorArgs<A, M, T>
  >,
  "mutationFn"
> {
  /**
   * Query keys to refetch upon successful mutation.
   * Use query.getQueryKey() to get the key from a query result.
   *
   * @example
   * const balanceQuery = getIcpBalance(account)
   * useMutation({
   *   refetchQueries: [balanceQuery.getQueryKey()],
   * })
   */
  refetchQueries?: (QueryKey | undefined)[]
  /**
   * Callback for canister-level business logic errors.
   * Called when the canister returns a Result { Err: E } variant.
   *
   * @param error - The CanisterError containing the typed error value
   * @param variables - The arguments passed to the mutation
   */
  onCanisterError?: (
    error: CanisterError<
      TransformReturnRegistry<ErrResult<ActorMethodReturnType<A[M]>>>[T]
    >,
    variables: ReactorArgs<A, M, T>
  ) => void
}

/**
 * Result from createMutation.
 */
export interface MutationResult<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> {
  /**
   * React hook for the mutation.
   * Accepts options to override/extend the factory config.
   *
   * @example
   * // With refetchQueries to auto-update balance after transfer
   * const { mutate } = icpTransferMutation.useMutation({
   *   refetchQueries: [userBalanceQuery], // Auto-refetch after success!
   * })
   */
  useMutation: (
    options?: MutationHookOptions<A, M, T>
  ) => UseMutationResult<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorArgs<A, M, T>
  >

  /** Execute the update call directly (outside of React) */
  execute: (args: ReactorArgs<A, M, T>) => Promise<ReactorReturnOk<A, M, T>>
}
