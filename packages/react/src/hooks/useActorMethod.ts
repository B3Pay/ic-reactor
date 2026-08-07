import { useCallback, useEffect, useMemo, useRef } from "react"
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
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> extends Omit<
  QueryObserverOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnOk<Service, Method, Transform>,
    QueryKey
  >,
  "queryKey" | "queryFn"
> {
  /** The reactor instance to use for method calls */
  reactor: Reactor<Service, Transform>

  /** The method name to call on the canister */
  functionName: Method

  /** Arguments to pass to the method (optional for parameterless methods) */
  args?: ReactorArgs<Service, Method, Transform>

  /** Agent call configuration (effectiveCanisterId, etc.) */
  callConfig?: CallConfig

  /** Custom query key (auto-generated if not provided) */
  queryKey?: QueryKey

  /**
   * Callback when the method call succeeds.
   * Works for both query and mutation methods.
   */
  onSuccess?: (data: ReactorReturnOk<Service, Method, Transform>) => void

  /**
   * Callback when the method call fails.
   * Works for both query and mutation methods.
   */
  onError?: (error: ReactorReturnErr<Service, Method, Transform>) => void

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
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = Omit<UseActorMethodParameters<Service, Method, Transform>, "reactor">

/**
 * Result type for useActorMethod hook.
 * Provides a unified interface for both query and mutation methods.
 */
export interface UseActorMethodResult<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> {
  /** The returned data from the method call */
  data: ReactorReturnOk<Service, Method, Transform> | undefined

  /** Whether the method is currently executing */
  isLoading: boolean

  /** Alias for isLoading - whether a mutation is pending */
  isPending: boolean

  /** Whether there was an error */
  isError: boolean

  /** Whether the method has successfully completed at least once */
  isSuccess: boolean

  /** The error if one occurred */
  error: ReactorReturnErr<Service, Method, Transform> | null

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
    args?: ReactorArgs<Service, Method, Transform>
  ) => Promise<ReactorReturnOk<Service, Method, Transform> | undefined>

  /**
   * Reset the state (clear data and error).
   * For queries: removes the query from cache
   * For mutations: resets the mutation state
   */
  reset: () => void

  /**
   * For queries only: Refetch the query
   */
  refetch: () => Promise<
    ReactorReturnOk<Service, Method, Transform> | undefined
  >

  // Expose underlying results for advanced use cases
  /** The raw query result (only available for query methods) */
  queryResult?: UseQueryResult<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>
  >

  /** The raw mutation result (only available for mutation methods) */
  mutationResult?: UseMutationResult<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>
  >
}

/**
 * A unified hook for calling canister methods that automatically handles
 * both query and mutation methods based on the Candid interface.
 */
export function useActorMethod<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
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
}: UseActorMethodParameters<Service, Method, Transform>): UseActorMethodResult<
  Service,
  Method,
  Transform
> {
  // Determine if this is a query method by checking the IDL
  const isQuery = useMemo(() => {
    if (!reactor) throw new Error("Reactor instance is required")
    return reactor.isQueryMethod(functionName)
  }, [reactor, functionName])

  const functionType: FunctionType = isQuery ? "query" : "update"

  // Latest callbacks, read at dispatch time: this keeps a rerendered closure
  // from being ignored, and keeps callback identity out of the effect deps.
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError

  // Build the key for a given set of call arguments.
  //
  // A custom `queryKey` is appended to the canister/function prefix rather than
  // replacing it, matching `useActorQuery`. Used verbatim it would carry no
  // canister id, so the entry would be invisible to the canister-scoped
  // invalidation `ClientManager.updateAgent` runs on identity change and would
  // keep serving the previous principal's data after sign-in or sign-out.
  const buildQueryKey = useCallback(
    (keyArgs: ReactorArgs<Service, Method, Transform> | undefined): QueryKey =>
      reactor.generateQueryKey(
        { functionName, args: keyArgs, queryKey: customQueryKey },
        callConfig
      ),
    [reactor, functionName, callConfig, customQueryKey]
  )

  const queryKey = useMemo(() => buildQueryKey(args), [buildQueryKey, args])

  // ============================================================================
  // Query Implementation
  // ============================================================================

  const queryResult = useQuery<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>
  >(
    {
      queryKey,
      // Callbacks deliberately do NOT live here: a queryFn runs once per fetch
      // attempt, so `onError` fired on every retry (four times with the default
      // QueryClient) and `onSuccess` never fired when data came from the cache
      // or a deduped sibling. They are dispatched from the settled observer
      // result below instead.
      queryFn: () =>
        reactor.callMethod({
          functionName,
          args,
          callConfig,
        }),
      enabled: isQuery && enabled,
      ...queryOptions,
    },
    reactor.queryClient
  )

  // Dispatch the query callbacks from the settled observer result, once per
  // distinct outcome. TanStack v5 removed `onSuccess`/`onError` from useQuery
  // for exactly this reason, so the settle timestamps are what identify a new
  // result: they also advance for a cache hit on a fresh mount, which is the
  // case that previously never notified at all.
  const notifiedSuccessAt = useRef<number | undefined>(undefined)
  const notifiedErrorAt = useRef<number | undefined>(undefined)

  const { status, data, error, dataUpdatedAt, errorUpdatedAt } = queryResult

  useEffect(() => {
    if (!isQuery) return
    if (status === "success" && dataUpdatedAt !== notifiedSuccessAt.current) {
      notifiedSuccessAt.current = dataUpdatedAt
      onSuccessRef.current?.(data)
    }
  }, [isQuery, status, data, dataUpdatedAt])

  useEffect(() => {
    if (!isQuery) return
    if (status === "error" && errorUpdatedAt !== notifiedErrorAt.current) {
      notifiedErrorAt.current = errorUpdatedAt
      onErrorRef.current?.(
        error as ReactorReturnErr<Service, Method, Transform>
      )
    }
  }, [isQuery, status, error, errorUpdatedAt])

  // ============================================================================
  // Mutation Implementation
  // ============================================================================

  const mutationResult = useMutation<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>
  >(
    {
      mutationKey: queryKey,
      mutationFn: async (mutationArgs) => {
        const result = await reactor.callMethod({
          functionName,
          args: mutationArgs ?? args,
          callConfig,
        })
        return result
      },
      onSuccess: (data) => {
        onSuccessRef.current?.(data)
        // Invalidate specified queries after successful mutation
        if (invalidateQueries && invalidateQueries.length > 0) {
          invalidateQueries.forEach((key) => {
            reactor.queryClient.invalidateQueries({ queryKey: key })
          })
        }
      },
      onError: (error) => {
        onErrorRef.current?.(error)
      },
    },
    reactor.queryClient
  )

  // ============================================================================
  // Unified Call Function
  // ============================================================================

  const call = useCallback(
    async (
      callArgs?: ReactorArgs<Service, Method, Transform>
    ): Promise<ReactorReturnOk<Service, Method, Transform> | undefined> => {
      if (isQuery) {
        // For queries, refetch with new args if provided
        if (callArgs !== undefined) {
          // Key on the args actually being called. Reusing the hook's
          // mount-time key would store this result under the previous args'
          // entry — poisoning it for every other reader — and let fetchQuery
          // dedupe onto an in-flight request for the old args, returning that
          // response as though it answered this one.
          try {
            const result = await reactor.queryClient.fetchQuery({
              queryKey: buildQueryKey(callArgs),
              queryFn: () =>
                reactor.callMethod({
                  functionName,
                  args: callArgs,
                  callConfig,
                }),
              staleTime: 0,
            })
            // Dispatched here rather than by the observer effect: this result
            // lands under the called args' key, which the mounted observer (bound
            // to the hook's own args) does not watch. That separation is also why
            // this can no longer double-fire the way it did when both wrote to
            // the same key.
            onSuccessRef.current?.(result)
            return result
          } catch (error) {
            onErrorRef.current?.(
              error as ReactorReturnErr<Service, Method, Transform>
            )
            return undefined
          }
        }
        // Otherwise just refetch
        const { data } = await queryResult.refetch()
        return data
      } else {
        // For mutations, execute with provided args
        return mutationResult
          .mutateAsync(callArgs as ReactorArgs<Service, Method, Transform>)
          .catch(() => undefined)
      }
    },
    [
      isQuery,
      reactor,
      functionName,
      callConfig,
      buildQueryKey,
      queryResult,
      mutationResult,
    ]
  )

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
    } as UseActorMethodResult<Service, Method, Transform>
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
    } as UseActorMethodResult<Service, Method, Transform>
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
  Service = BaseActor,
  Transform extends TransformKey = "candid",
>(reactor: Reactor<Service, Transform>) {
  return {
    /**
     * Hook for calling methods on the bound reactor.
     */
    useMethod: <Method extends FunctionName<Service>>(
      config: Omit<
        UseActorMethodParameters<Service, Method, Transform>,
        "reactor"
      >
    ) =>
      useActorMethod({ ...config, reactor } as UseActorMethodParameters<
        Service,
        Method,
        Transform
      >),
  }
}
