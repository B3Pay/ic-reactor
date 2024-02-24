import React from "react"
import { useStore } from "zustand"
import type {
  ActorCallState,
  UseMethodCall,
  UseActorState,
  UseQueryCall,
  UseUpdateCall,
  ActorHooksReturnType,
} from "../types"
import type {
  VisitService,
  ActorMethodParameters,
  FunctionName,
  ActorManager,
  BaseActor,
} from "@ic-reactor/core/dist/types"

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
 * - useQueryCall: Hook specifically designed for query calls to actors with features such as automatic refetching on mount and at specified intervals.
 * - useUpdateCall: Hook specifically designed for update calls to actors with features such as error handling and loading state management.
 *
 * Each hook is designed to simplify the process of interacting with actors in IC projects by abstracting away the complexity of state management, error handling, and method invocation.
 */
export const actorHooks = <A = BaseActor>(
  actorManager: ActorManager<A>
): ActorHooksReturnType<A> => {
  const { actorStore, canisterId, visitFunction, callMethod, initialize } =
    actorManager

  const useActorState = (): UseActorState => ({
    ...useStore(actorStore),
    canisterId,
  })

  const useVisitMethod = <M extends FunctionName<A>>(
    functionName: M
  ): VisitService<A>[M] => {
    return React.useMemo(() => visitFunction[functionName], [functionName])
  }

  const useMethodCall: UseMethodCall<A> = ({
    args = [],
    functionName,
    throwOnError = false,
    ...events
  }) => {
    type M = typeof functionName
    const [state, setState] =
      React.useState<ActorCallState<A, M>>(DEFAULT_STATE)

    const reset = React.useCallback(() => setState(DEFAULT_STATE), [])

    const call = React.useCallback(
      async (
        eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
      ) => {
        setState((prev) => ({ ...prev, error: undefined, loading: true }))
        events?.onLoading?.(true)

        try {
          const replaceArgs =
            eventOrReplaceArgs instanceof Array ? eventOrReplaceArgs : args
          const data = await callMethod(
            functionName,
            ...(replaceArgs as ActorMethodParameters<A[M]>)
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
    const { call, ...state } = useMethodCall(rest)
    const intervalId = React.useRef<NodeJS.Timeout>()

    React.useEffect(() => {
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

  const useUpdateCall: UseUpdateCall<A> = useMethodCall

  return {
    initialize,
    useQueryCall,
    useUpdateCall,
    useActorState,
    useVisitMethod,
  }
}
