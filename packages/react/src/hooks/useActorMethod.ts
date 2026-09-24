import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
} from "react"
import {
  useQuery,
  useMutation,
  hashKey,
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
  ReactorQueryData,
  ReactorReturnErr,
  FunctionType,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"
import {
  normalizeQueryData,
  pickFetchOptions,
  useMountQueryClient,
} from "../utils.js"

/**
 * Configuration for useActorMethod hook.
 * Extends react-query's QueryObserverOptions with custom reactor params.
 *
 * This is a unified hook that handles both query and mutation methods.
 * Query-specific options (like refetchInterval) only apply to query methods.
 * Mutation-specific options (like invalidateQueries) only apply to mutation methods.
 *
 * `retry`, `retryDelay`, `networkMode` and `meta` decide how a call runs, so
 * they apply to both. An update method's call is a mutation: without a `retry`
 * here it follows the QueryClient's mutation defaults, which retry nothing
 * unless the app set `mutations.retry`, because each attempt runs the update
 * on the canister again. Its query defaults, such as `reactorRetry`, do not
 * apply to it.
 */
export interface UseActorMethodParameters<
  Service = BaseActor,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
> extends Omit<
  QueryObserverOptions<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
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
   *
   * A method's `undefined` result arrives as `null`, as in `useActorQuery`,
   * for query and update methods alike.
   */
  onSuccess?: (
    data: ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>
  ) => void

  /**
   * Callback when the method call fails.
   * Works for both query and mutation methods.
   */
  onError?: (error: ReactorReturnErr<Service, Method, Transform>) => void

  /**
   * Query keys to invalidate after a successful mutation.
   * Only applies to mutation methods (updates).
   *
   * The invalidation is awaited before `onSuccess` runs, as in
   * `useActorMutation` and `createMutation`, so `onSuccess` sees the
   * refetched data, and `call()` resolves once the invalidated queries in use
   * have refetched.
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
  /**
   * The returned data from the method call. A method's `undefined` result is
   * `null` here, as in `useActorQuery`, so `undefined` means that no call has
   * settled yet, that the last call failed, or that an update call is
   * running. A query keeps its earlier data when a refetch fails.
   */
  data:
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>> | undefined

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
  ) => Promise<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>> | undefined
  >

  /**
   * Reset the state (data and error).
   * For queries: resets this hook's own cache entry to its initial state, so
   * `data` goes back to `initialData` when one was given and is cleared
   * otherwise. An enabled hook then refetches. Other args of the same method
   * are left alone.
   * For mutations: resets the mutation state
   */
  reset: () => void

  /**
   * For queries only: Refetch the query
   */
  refetch: () => Promise<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>> | undefined
  >

  // Expose underlying results for advanced use cases
  /** The raw query result (only available for query methods) */
  queryResult?: UseQueryResult<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    ReactorReturnErr<Service, Method, Transform>
  >

  /** The raw mutation result (only available for mutation methods) */
  mutationResult?: UseMutationResult<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>
  >
}

/**
 * A ref to `value` as of the last committed render, for code that runs outside
 * render: event handlers, timers, effects and TanStack callbacks.
 *
 * Assigning the ref during render would also publish renders that React throws
 * away, such as a transition that suspends or one that a more urgent update
 * interrupts. The tree still on screen would then act on props it never showed,
 * like calling a method it does not render. An insertion effect runs only when
 * its render commits, and before every layout and passive effect of that
 * commit, so no effect anywhere in the tree reads the previous commit's value.
 * React's own `useEffectEvent` also swaps in its new function during the
 * commit, ahead of layout effects. Unlike `useLayoutEffect`, an insertion
 * effect does not warn in a React 18 server render. The initial value serves
 * anything that runs before the first commit.
 */
function useCommittedRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  useInsertionEffect(() => {
    ref.current = value
  })
  return ref
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
  type TData = ReactorReturnOk<Service, Method, Transform>
  type TQueryData = ReactorQueryData<TData>

  // Determine if this is a query method by checking the IDL
  const isQuery = useMemo(() => {
    if (!reactor) throw new Error("Reactor instance is required")
    return reactor.isQueryMethod(functionName)
  }, [reactor, functionName])

  const functionType: FunctionType = isQuery ? "query" : "update"

  useMountQueryClient(reactor.queryClient)

  // The committed render's callbacks, read at dispatch time: this keeps a
  // rerendered closure from being ignored, and keeps callback identity out of
  // the effect deps.
  const onSuccessRef = useCommittedRef(onSuccess)
  const onErrorRef = useCommittedRef(onError)

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
    // `canisterId` is mutable reactor state that `setCanisterId` can change,
    // while `reactor` itself stays the same object — so it has to be a
    // dependency in its own right or the key stays pinned to the old canister.
    [
      reactor,
      reactor.canisterId?.toString(),
      functionName,
      callConfig,
      customQueryKey,
    ]
  )

  const queryKey = useMemo(() => buildQueryKey(args), [buildQueryKey, args])

  // ============================================================================
  // Query Implementation
  // ============================================================================

  const queryResult = useQuery<
    TQueryData,
    ReactorReturnErr<Service, Method, Transform>
  >(
    {
      queryKey,
      // Callbacks deliberately do NOT live here: a queryFn runs once per fetch
      // attempt, so `onError` fired on every retry (four times with the default
      // QueryClient) and `onSuccess` never fired when data came from the cache
      // or a deduped sibling. They are dispatched from the settled observer
      // result below instead.
      //
      // TanStack Query fails a query whose queryFn resolves `undefined`, with
      // "data is undefined", and a successful call can resolve it. A
      // DisplayReactor decodes an `opt` None to `undefined`, and a `()` query
      // returns nothing. Every other query path normalizes the value to `null`.
      queryFn: async () =>
        normalizeQueryData<TData>(
          (await reactor.callMethod({
            functionName,
            args,
            callConfig,
          })) as TData
        ),
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

  const {
    status,
    data,
    error,
    dataUpdatedAt,
    errorUpdatedAt,
    isPlaceholderData,
    isFetched,
  } = queryResult

  useEffect(() => {
    if (!isQuery) return
    // Placeholder data also has `status: "success"`, but no call has returned
    // it: it is the `placeholderData` option, or with `keepPreviousData` the
    // previous args' result standing in while this call is in flight.
    if (isPlaceholderData) return
    // So does `initialData`: an entry starts with it, and `reset()` puts it
    // back, before any fetch of the entry has settled. The first fetch that
    // settles makes the entry fetched, and its result is reported below.
    if (!isFetched) return
    if (status === "success" && dataUpdatedAt !== notifiedSuccessAt.current) {
      notifiedSuccessAt.current = dataUpdatedAt
      onSuccessRef.current?.(data)
    }
  }, [isQuery, status, data, dataUpdatedAt, isPlaceholderData, isFetched])

  useEffect(() => {
    if (!isQuery) return
    if (status === "error" && errorUpdatedAt !== notifiedErrorAt.current) {
      notifiedErrorAt.current = errorUpdatedAt
      onErrorRef.current?.(
        error as ReactorReturnErr<Service, Method, Transform>
      )
    }
  }, [isQuery, status, error, errorUpdatedAt])

  // `call(args)` reports its own outcome, once per call, because the args it
  // fetched usually key an entry this observer does not watch. When they key
  // the entry it does watch, the effects above see the same settle, and each
  // callback used to fire twice for one call. So the settle that ends a call's
  // fetch is marked as notified when it lands in the observed entry, and the
  // effects skip it.
  //
  // A query cache listener sets that mark while TanStack dispatches the
  // settle, before any render can show it. Matching a settle up by its
  // timestamp afterwards could not tell settles apart: two in one millisecond
  // share a timestamp. And a call that an identity switch cancels settles
  // nothing: TanStack reverts the entry to its previous result, timestamp
  // included, so the call's outcome looked reported already, and neither the
  // call nor the effects reported it.
  const observedKeyRef = useCommittedRef(queryKey)
  const markCallSettle = (calledKey: QueryKey): (() => void) => {
    const { queryClient } = reactor
    // The hash TanStack files the called entry under, worked out the way
    // `fetchQuery` does. The listener compares it with hashes TanStack has
    // already computed rather than hashing keys itself: the QueryClient may be
    // shared with the app, whose keys a custom `queryKeyHashFn` can let hold
    // values that `hashKey` throws on, inside TanStack's dispatch.
    const calledHash = queryClient.defaultQueryOptions({
      queryKey: calledKey,
    }).queryHash
    let settled = false
    return queryClient.getQueryCache().subscribe((event) => {
      if (settled || event.type !== "updated") return
      const { action, query } = event
      // A fetch settles with one of these. `setQueryData` dispatches a
      // success too, flagged manual, and it does not end this call's fetch.
      const isSettle =
        action.type === "error" || (action.type === "success" && !action.manual)
      if (!isSettle || query.queryHash !== calledHash) return
      settled = true
      if (hashKey(calledKey) !== hashKey(observedKeyRef.current)) return
      if (action.type === "success") {
        notifiedSuccessAt.current = query.state.dataUpdatedAt
      } else {
        notifiedErrorAt.current = query.state.errorUpdatedAt
      }
    })
  }

  // ============================================================================
  // Mutation Implementation
  // ============================================================================

  const mutationResult = useMutation<
    TQueryData,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>
  >(
    {
      mutationKey: queryKey,
      // The hook's `retry`, `retryDelay`, `networkMode` and `meta`, the options
      // that decide how a call runs, as the query branch's `call()` applies
      // them. They reached only the query branch, so an update's call ignored
      // them: it stayed paused offline under `networkMode: "always"` and
      // reached the MutationCache callbacks without the hook's `meta`. Unset
      // ones are left to the QueryClient's mutation defaults, which retry
      // nothing unless the app set `mutations.retry`: each attempt of an
      // update is a new call the canister runs, so only a `retry` given here
      // or in those defaults sends one again.
      ...pickFetchOptions(queryOptions),
      // Normalized like the query branch, so `data`, `call()` and `onSuccess`
      // mean the same thing for both kinds of method. The hook cannot type the
      // two branches apart: a Candid service type does not say which methods
      // are queries.
      mutationFn: async (mutationArgs) =>
        normalizeQueryData<TData>(
          (await reactor.callMethod({
            functionName,
            args: mutationArgs ?? args,
            callConfig,
          })) as TData
        ),
      // Invalidation first, then `onSuccess`, as `useActorMutation` and
      // `createMutation` do. TanStack Query waits for the promise returned
      // here before it settles the mutation, so `call()` resolves, and
      // `isPending` turns false, once the invalidated queries that are in use
      // have refetched, and `onSuccess` reads the refetched data. A refetch
      // that fails does not reject `invalidateQueries`, so it cannot turn the
      // update, which has already run on the canister, into a failure.
      onSuccess: async (data) => {
        if (invalidateQueries && invalidateQueries.length > 0) {
          await Promise.all(
            invalidateQueries.map((queryKey) =>
              reactor.queryClient.invalidateQueries({ queryKey })
            )
          )
        }
        onSuccessRef.current?.(data)
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

  const callLatest = async (
    callArgs?: ReactorArgs<Service, Method, Transform>
  ): Promise<TQueryData | undefined> => {
    if (isQuery) {
      // For queries, refetch with new args if provided
      if (callArgs !== undefined) {
        // Key on the args actually being called. Reusing the hook's
        // mount-time key would store this result under the previous args'
        // entry — poisoning it for every other reader — and let fetchQuery
        // dedupe onto an in-flight request for the old args, returning that
        // response as though it answered this one.
        const calledKey = buildQueryKey(callArgs)
        const stopMarking = markCallSettle(calledKey)
        // Reported here rather than by the observer effects: this result
        // usually lands under a key the mounted observer (bound to the hook's
        // own args) does not watch. When it is that key, `markCallSettle` has
        // already kept the effects from reporting it as well. Either way the
        // callbacks get what the call settles with. For a cancelled call that
        // is TanStack's `CancelledError`, or, when the entry had data, the
        // data it reverted to, which `fetchQuery` resolves with instead.
        try {
          const result = await reactor.queryClient.fetchQuery<
            TQueryData,
            ReactorReturnErr<Service, Method, Transform>
          >({
            // The options the hook's own fetches run with: `retry`,
            // `retryDelay`, `networkMode` and `meta`. With only a key and a
            // function, a call ran on the QueryClient's defaults. It failed on
            // the first error the hook retried through, stayed paused offline
            // under `networkMode: "always"`, and reached the QueryCache
            // callbacks without the hook's `meta`.
            ...pickFetchOptions(queryOptions),
            queryKey: calledKey,
            // Normalize for the same reason as the observer's queryFn.
            queryFn: async () =>
              normalizeQueryData<TData>(
                (await reactor.callMethod({
                  functionName,
                  args: callArgs,
                  callConfig,
                })) as TData
              ),
            staleTime: 0,
          })
          onSuccessRef.current?.(result)
          return result
        } catch (error) {
          onErrorRef.current?.(
            error as ReactorReturnErr<Service, Method, Transform>
          )
          return undefined
        } finally {
          stopMarking()
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
  }

  // ============================================================================
  // Reset Function
  // ============================================================================

  const resetLatest = () => {
    if (isQuery) {
      // Reset, not remove. `removeQueries` drops the entry without notifying
      // its observers, so this hook kept rendering the old data while bound to
      // a query that was no longer in the cache. No later invalidation reached
      // it, including the one an identity switch runs. `resetQueries` notifies
      // the observer and refetches the entry when the hook is enabled. It is
      // `exact` because only this hook's entry should reset. A prefix match on
      // a no-args key would also reset every args variant other hooks render.
      void reactor.queryClient.resetQueries({ queryKey, exact: true })
    } else {
      mutationResult.reset()
    }
  }

  // ============================================================================
  // Refetch Function
  // ============================================================================

  const refetchLatest = async () => {
    if (isQuery) {
      const result = await queryResult.refetch()
      return result.data
    }
    return undefined
  }

  // `call`, `reset` and `refetch` keep one identity for the life of the
  // component, as TanStack's own `refetch`, `mutate` and `reset` do, and run
  // the latest committed render's implementation above when invoked. They used
  // to be `useCallback`s listing the query and mutation results, which TanStack
  // Query returns fresh every render, so they changed every render too. An
  // effect that lists one — `react-hooks/exhaustive-deps` requires it as soon
  // as the effect calls it — then re-ran after every render its own call
  // caused: an unbounded loop of canister calls, state-changing ones for an
  // update method.
  const latest = useCommittedRef({
    call: callLatest,
    reset: resetLatest,
    refetch: refetchLatest,
  })

  const call = useCallback(
    (callArgs?: ReactorArgs<Service, Method, Transform>) =>
      latest.current.call(callArgs),
    []
  )
  const reset = useCallback(() => latest.current.reset(), [])
  const refetch = useCallback(() => latest.current.refetch(), [])

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
