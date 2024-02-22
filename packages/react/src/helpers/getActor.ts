import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "zustand"
import type {
  ActorCallState,
  ReactorCall,
  UseActorState,
  UseQueryCall,
  UseUpdateCall,
  UseMethodCallReturn,
  UseMethodCallArg,
  GetActorHooks,
} from "../types"
import type {
  VisitService,
  ActorMethodArgs,
  FunctionName,
  BaseActor,
} from "@ic-reactor/core/dist/types"
import type { ActorManager } from "@ic-reactor/core"

const DEFAULT_STATE: ActorCallState<never, never> = {
  data: undefined,
  error: undefined,
  loading: false,
}
/**
 * Provides a set of React hooks designed for interacting with actors in an Internet Computer (IC) project using the React framework and Zustand for state management.
 *
 * @param actorManager An instance of ActorManager containing methods and properties to manage actors, including the actorStore, canisterId, visitFunction, callMethod, and initialize function.
 * @returns An object containing several hooks and utility functions for interacting with actors, managing state, and invoking actor methods.
 *
 * Hooks included:
 * - initialize: Function to initialize actor management.
 * - useActorState: Hook for accessing the actor's state including the canister ID.
 * - useVisitMethod: Hook for memoizing a method visit service for a given actor method name.
 * - useReactorCall: Hook for making calls to actor methods with support for loading states, errors, and custom event handlers.
 * - useQueryCall: Hook specifically designed for query calls to actors with features such as automatic refetching on mount and at specified intervals.
 * - useUpdateCall: Alias for useReactorCall, tailored for update calls to actors.
 * - useMethodCall: Combines useVisitMethod and useReactorCall for a streamlined experience when calling actor methods, including visitation and state management.
 *
 * Each hook is designed to simplify the process of interacting with actors in IC projects by abstracting away the complexity of state management, error handling, and method invocation.
 */
export const getActorHooks = <A = BaseActor>(
  actorManager: ActorManager<A>
): GetActorHooks<A> => {
  const { actorStore, canisterId, visitFunction, callMethod, initialize } =
    actorManager

  const useActorState = (): UseActorState => ({
    ...useStore(actorStore),
    canisterId,
  })

  const useVisitMethod = <M extends FunctionName<A>>(
    functionName: M
  ): VisitService<A>[M] => {
    return useMemo(() => visitFunction[functionName], [functionName])
  }

  const useReactorCall: ReactorCall<A> = ({
    args = [],
    functionName,
    throwOnError = false,
    ...events
  }) => {
    const [state, setState] =
      useState<ActorCallState<A, typeof functionName>>(DEFAULT_STATE)

    const reset = useCallback(() => setState(DEFAULT_STATE), [])

    const call = useCallback(
      async (
        eventOrReplaceArgs?:
          | React.MouseEvent
          | ActorMethodArgs<A[typeof functionName]>
      ) => {
        setState((prev) => ({ ...prev, error: undefined, loading: true }))
        events?.onLoading?.(true)

        try {
          const replaceArgs =
            eventOrReplaceArgs instanceof Array ? eventOrReplaceArgs : args
          const data = await callMethod(
            functionName,
            ...(replaceArgs as ActorMethodArgs<A[typeof functionName]>)
          )

          setState({ data, error: undefined, loading: false })
          events?.onSuccess?.(data)
          events?.onLoading?.(false)
          return data
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Error in call:", error)
          setState((prevState) => ({
            ...prevState,
            error: error as Error,
            loading: false,
          }))
          events?.onError?.(error as Error)
          events?.onLoading?.(false)

          if (throwOnError) throw error
        }
      },
      [args, functionName, events]
    )

    return { call, reset, ...state }
  }

  const useQueryCall: UseQueryCall<A> = ({
    refetchOnMount = true,
    refetchInterval = false,
    ...rest
  }) => {
    const { call, ...state } = useReactorCall(rest)
    const intervalId = useRef<NodeJS.Timeout>()

    useEffect(() => {
      if (refetchInterval) {
        intervalId.current = setInterval(call, refetchInterval)
      }

      if (refetchOnMount) {
        call()
      }

      return () => clearInterval(intervalId.current)
    }, [refetchInterval, refetchOnMount])

    return { call, ...state }
  }

  const useUpdateCall: UseUpdateCall<A> = useReactorCall

  const useMethodCall = <M extends FunctionName<A>>(
    args: UseMethodCallArg<A, M>
  ): UseMethodCallReturn<A, M> => {
    const visit = useVisitMethod(args.functionName)
    return { visit, ...useReactorCall(args) }
  }

  return {
    initialize,
    useQueryCall,
    useUpdateCall,
    useActorState,
    useMethodCall,
    useVisitMethod,
  }
}
