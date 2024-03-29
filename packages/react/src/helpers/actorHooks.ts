import React from "react"
import { useStore } from "zustand"
import type {
  UseSharedCallState,
  UseSharedCall,
  UseActorState,
  UseQueryCall,
  UseUpdateCall,
  ActorHooksReturnType,
  UseMethod,
  UseMethodParameters,
  UseMethodReturnType,
} from "../types"
import type {
  VisitService,
  ActorMethodParameters,
  FunctionName,
  ActorManager,
  BaseActor,
  IDL,
} from "@ic-reactor/core/dist/types"

const DEFAULT_STATE: UseSharedCallState<never, never> = {
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
  const {
    actorStore,
    canisterId,
    visitFunction,
    methodAttributes,
    extractMethodAttributes,
    extractInterface,
    callMethod,
    initialize,
  } = actorManager

  const useActorState = (): UseActorState => ({
    ...useStore(actorStore),
    canisterId,
  })

  const useMethodNames = <Actor = A>(): FunctionName<Actor>[] => {
    return React.useMemo(
      () => Object.keys(extractMethodAttributes()) as FunctionName<Actor>[],
      []
    )
  }

  const useActorInterface = (): IDL.ServiceClass => {
    return React.useMemo(() => extractInterface(), [])
  }

  const useVisitService = (): VisitService<A> => {
    return visitFunction
  }

  const useVisitMethod = <M extends FunctionName<A>>(
    functionName: M
  ): VisitService<A>[M] => {
    return React.useMemo(() => {
      if (!visitFunction[functionName]) {
        throw new Error(`Method ${functionName} not found`)
      }

      return visitFunction[functionName]
    }, [functionName])
  }

  const useSharedCall: UseSharedCall<A> = ({
    args = [],
    functionName,
    throwOnError = false,
    ...events
  }) => {
    type M = typeof functionName
    const [sharedState, setSharedState] =
      React.useState<UseSharedCallState<A, M>>(DEFAULT_STATE)

    const reset = React.useCallback(() => setSharedState(DEFAULT_STATE), [])

    const call = React.useCallback(
      async (
        eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
      ) => {
        setSharedState((prev) => ({ ...prev, error: undefined, loading: true }))
        events?.onLoading?.(true)

        try {
          const replaceArgs =
            eventOrReplaceArgs instanceof Array ? eventOrReplaceArgs : args
          const data = await callMethod(
            functionName,
            ...(replaceArgs as ActorMethodParameters<A[M]>)
          )

          setSharedState({ data, error: undefined, loading: false })
          events?.onSuccess?.(data)
          events?.onLoading?.(false)
          return data
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Error in call:", error)
          setSharedState((prevState) => ({
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

    return { call, reset, ...sharedState }
  }

  const useQueryCall: UseQueryCall<A> = ({
    refetchOnMount = true,
    refetchInterval = false,
    ...rest
  }) => {
    const { call, ...state } = useSharedCall(rest)
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

  const useUpdateCall: UseUpdateCall<A> = useSharedCall

  const useMethod: UseMethod<A> = <M extends FunctionName<A>>(
    args: UseMethodParameters<A, M>
  ): UseMethodReturnType<A, M> => {
    const visit = useVisitMethod(args.functionName)

    const attributes = methodAttributes[args.functionName]

    let refetchOnMount = args.refetchOnMount
    let refetchInterval = args.refetchInterval
    let formRequired = true

    switch (attributes.type) {
      case "query":
        try {
          if (attributes.numberOfArgs > 0 && args.args === undefined) {
            throw new Error("Args required")
          }
          attributes.validate((args.args || []) as never)
          formRequired = args.refetchOnMount === false ? true : false
        } catch (error) {
          refetchOnMount = false
          refetchInterval = false
        }
        return {
          visit,
          ...useQueryCall({
            ...args,
            refetchOnMount,
            refetchInterval,
          }),
          formRequired,
        }
      case "update":
        return { visit, ...useUpdateCall(args), formRequired }
      default:
        throw new Error(`Method type ${attributes.type} not found`)
    }
  }

  return {
    initialize,
    useMethod,
    useMethodNames,
    useQueryCall,
    useUpdateCall,
    useActorState,
    useVisitMethod,
    useVisitService,
    useActorInterface,
  }
}
