import { useCallback, useMemo } from "react"
import {
  useQuery,
  useMutation,
  type UseQueryResult,
  type UseMutationResult,
  type QueryKey,
  type QueryObserverOptions,
} from "@tanstack/react-query"
import {
  Reactor,
  BaseActor,
  FunctionName,
  TransformKey,
  ReactorArgs,
  ReactorReturnOk,
  ReactorReturnErr,
  FunctionType,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"

/**
 * Configuration for useActorMethod hook.
 * Extends react-query's QueryObserverOptions with custom reactor params.
 *
 * This is a unified hook that handles both query and mutation methods.
 * Query-specific options (like refetchInterval) only apply to query methods.
 * Mutation-specific options (like invalidateQueries) only apply to mutation methods.
 */
export interface UseActorMethodParameters<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> extends Omit<
  QueryObserverOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorReturnOk<A, M, T>,
    ReactorReturnOk<A, M, T>,
    QueryKey
  >,
  "queryKey" | "queryFn"
> {
  /** The reactor instance to use for method calls */
  reactor: Reactor<A, T>

  /** The method name to call on the canister */
  functionName: M

  /** Arguments to pass to the method (optional for parameterless methods) */
  args?: ReactorArgs<A, M, T>

  /** Agent call configuration (effectiveCanisterId, etc.) */
  callConfig?: CallConfig

  /** Custom query key (auto-generated if not provided) */
  queryKey?: QueryKey

  /**
   * Callback when the method call succeeds.
   * Works for both query and mutation methods.
   */
  onSuccess?: (data: ReactorReturnOk<A, M, T>) => void

  /**
   * Callback when the method call fails.
   * Works for both query and mutation methods.
   */
  onError?: (error: ReactorReturnErr<A, M, T>) => void

  /**
   * Query keys to invalidate after a successful mutation.
   * Only applies to mutation methods (updates).
   */
  invalidateQueries?: QueryKey[]
}

/**
 * Configuration type for bound useActorMethod hook (reactor omitted).
 * For use with createActorHooks.
 */
export type UseActorMethodConfig<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> = Omit<UseActorMethodParameters<A, M, T>, "reactor">

/**
 * Result type for useActorMethod hook.
 * Provides a unified interface for both query and mutation methods.
 */
export interface UseActorMethodResult<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
> {
  /** The returned data from the method call */
  data: ReactorReturnOk<A, M, T> | undefined

  /** Whether the method is currently executing */
  isLoading: boolean

  /** Alias for isLoading - whether a mutation is pending */
  isPending: boolean

  /** Whether there was an error */
  isError: boolean

  /** Whether the method has successfully completed at least once */
  isSuccess: boolean

  /** The error if one occurred */
  error: ReactorReturnErr<A, M, T> | null

  /** Whether this is a query method (true) or mutation method (false) */
  isQuery: boolean

  /** The function type (query, update, composite_query) */
  functionType: FunctionType

  /**
   * Call the method with optional arguments.
   * For queries: triggers a refetch
   * For mutations: executes the mutation with the provided args
   */
  call: (
    args?: ReactorArgs<A, M, T>
  ) => Promise<ReactorReturnOk<A, M, T> | undefined>

  /**
   * Reset the state (clear data and error).
   * For queries: removes the query from cache
   * For mutations: resets the mutation state
   */
  reset: () => void

  /**
   * For queries only: Refetch the query
   */
  refetch: () => Promise<ReactorReturnOk<A, M, T> | undefined>

  // Expose underlying results for advanced use cases
  /** The raw query result (only available for query methods) */
  queryResult?: UseQueryResult<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>
  >

  /** The raw mutation result (only available for mutation methods) */
  mutationResult?: UseMutationResult<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorArgs<A, M, T>
  >
}

/**
 * A unified hook for calling canister methods that automatically handles
 * both query and mutation methods based on the Candid interface.
 */
export function useActorMethod<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
>({
  reactor,
  functionName,
  args,
  callConfig,
  queryKey: customQueryKey,
  enabled = true,
  onSuccess,
  onError,
  invalidateQueries,
  ...queryOptions
}: UseActorMethodParameters<A, M, T>): UseActorMethodResult<A, M, T> {
  // Determine if this is a query method by checking the IDL
  const isQuery = useMemo(() => {
    return reactor.isQueryMethod(functionName)
  }, [reactor, functionName])

  const functionType: FunctionType = isQuery ? "query" : "update"

  // Generate query key
  const queryKey = useMemo(() => {
    if (customQueryKey) return customQueryKey
    return reactor.generateQueryKey({
      functionName,
      args,
    })
  }, [reactor, functionName, args, customQueryKey])

  // ============================================================================
  // Query Implementation
  // ============================================================================

  const queryResult = useQuery<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>
  >(
    {
      queryKey,
      queryFn: async () => {
        try {
          const result = await reactor.callMethod({
            functionName,
            args,
            callConfig,
          })
          onSuccess?.(result)
          return result
        } catch (error) {
          onError?.(error as ReactorReturnErr<A, M, T>)
          throw error
        }
      },
      enabled: isQuery && enabled,
      ...queryOptions,
    },
    reactor.queryClient
  )

  // ============================================================================
  // Mutation Implementation
  // ============================================================================

  const mutationResult = useMutation<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorArgs<A, M, T>
  >(
    {
      mutationFn: async (mutationArgs) => {
        const result = await reactor.callMethod({
          functionName,
          args: mutationArgs ?? args,
          callConfig,
        })
        return result
      },
      onSuccess: (data) => {
        onSuccess?.(data)
        // Invalidate specified queries after successful mutation
        if (invalidateQueries && invalidateQueries.length > 0) {
          invalidateQueries.forEach((key) => {
            reactor.queryClient.invalidateQueries({ queryKey: key })
          })
        }
      },
      onError: (error) => {
        onError?.(error)
      },
    },
    reactor.queryClient
  )

  // ============================================================================
  // Unified Call Function
  // ============================================================================

  const call = async (
    callArgs?: ReactorArgs<A, M, T>
  ): Promise<ReactorReturnOk<A, M, T> | undefined> => {
    if (isQuery) {
      // For queries, refetch with new args if provided
      if (callArgs !== undefined) {
        try {
          const result = await reactor.callMethod({
            functionName,
            args: callArgs,
            callConfig,
          })
          // Update the cache using the HOOK's queryKey
          reactor.queryClient.setQueryData(queryKey, result)
          onSuccess?.(result)
          return result
        } catch (error) {
          onError?.(error as ReactorReturnErr<A, M, T>)
          return undefined
        }
      }
      // Otherwise just refetch
      const { data } = await queryResult.refetch()
      return data
    } else {
      // For mutations, execute with provided args
      return mutationResult
        .mutateAsync(callArgs as ReactorArgs<A, M, T>)
        .catch(() => undefined)
    }
  }

  // ============================================================================
  // Reset Function
  // ============================================================================

  const reset = useCallback(() => {
    if (isQuery) {
      reactor.queryClient.removeQueries({ queryKey })
    } else {
      mutationResult.reset()
    }
  }, [isQuery, reactor, queryKey, mutationResult])

  // ============================================================================
  // Refetch Function
  // ============================================================================

  const refetch = useCallback(async () => {
    if (isQuery) {
      const result = await queryResult.refetch()
      return result.data
    }
    return undefined
  }, [isQuery, queryResult])

  // ============================================================================
  // Return Unified Result
  // ============================================================================

  if (isQuery) {
    return {
      data: queryResult.data,
      isLoading: queryResult.isLoading,
      isPending: queryResult.isLoading,
      isError: queryResult.isError,
      isSuccess: queryResult.isSuccess,
      error: queryResult.error,
      isQuery: true,
      functionType,
      call,
      reset,
      refetch,
      queryResult,
    } as UseActorMethodResult<A, M, T>
  } else {
    return {
      data: mutationResult.data,
      isLoading: mutationResult.isPending,
      isPending: mutationResult.isPending,
      isError: mutationResult.isError,
      isSuccess: mutationResult.isSuccess,
      error: mutationResult.error,
      isQuery: false,
      functionType,
      call,
      reset,
      refetch,
      mutationResult,
    } as UseActorMethodResult<A, M, T>
  }
}

/**
 * Creates a bound useMethod hook for a specific reactor instance.
 *
 * @example
 * ```tsx
 * const { useMethod } = createActorMethodHooks(reactor)
 * ```
 */
export function createActorMethodHooks<
  A = BaseActor,
  T extends TransformKey = "candid",
>(reactor: Reactor<A, T>) {
  return {
    /**
     * Hook for calling methods on the bound reactor.
     */
    useMethod: <M extends FunctionName<A>>(
      config: Omit<UseActorMethodParameters<A, M, T>, "reactor">
    ) =>
      useActorMethod({ ...config, reactor } as UseActorMethodParameters<
        A,
        M,
        T
      >),
  }
}
