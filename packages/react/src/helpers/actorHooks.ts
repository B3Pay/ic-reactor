import * as React from "react"
import { useStore } from "zustand"
import type {
  UseSharedCallState,
  UseSharedCall,
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
  MethodAttributes,
  ActorMethodState,
} from "@ic-reactor/core/dist/types"
import { generateRequestHash } from "../utils"
import { useShallow } from "zustand/react/shallow"

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
    updateMethodState,
    extractMethodAttributes,
    extractInterface,
    callMethod,
    initialize,
  } = actorManager

  const useActorState = () =>
    useStore(
      actorStore,
      useShallow((state) => ({
        error: state.error,
        initialized: state.initialized,
        initializing: state.initializing,
        canisterId,
      }))
    )

  const useMethodState = <M extends FunctionName<A>>(
    functionName: M,
    requestKey: string
  ): [
    ActorMethodState<A, M>[string],
    (newState: Partial<ActorMethodState<A, M>[string]>) => void
  ] => {
    const state =
      useStore(
        actorStore,
        useShallow((state) => state.methodState[functionName]?.[requestKey])
      ) || DEFAULT_STATE

    const setSharedState = React.useCallback(
      (newState: Partial<ActorMethodState<A, M>[string]>) => {
        updateMethodState(functionName, requestKey, newState)
      },
      [functionName, requestKey]
    )

    return [state, setSharedState]
  }

  const useMethodAttributes = <Actor = A>(): MethodAttributes<Actor> => {
    return React.useMemo(
      extractMethodAttributes,
      []
    ) as unknown as MethodAttributes<Actor>
  }

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

    const requestKey = React.useMemo(() => generateRequestHash(args), [args])

    const [sharedState, setSharedState] = useMethodState(
      functionName,
      requestKey
    )

    const reset = React.useCallback(
      () => updateMethodState(functionName, requestKey, DEFAULT_STATE),
      [functionName, requestKey]
    )

    const call = React.useCallback(
      async (
        eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
      ) => {
        setSharedState({ error: undefined, loading: true })
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
          setSharedState({
            error: error as Error,
            loading: false,
          })
          events?.onError?.(error as Error)
          events?.onLoading?.(false)

          if (throwOnError) throw error
        }
      },
      [args, functionName, events]
    )

    return { call, reset, requestKey, ...sharedState }
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

      if (refetchOnMount && state.data === undefined) {
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
    const visit: VisitService<A>[M] = React.useCallback(
      (extractorClass, data) => {
        if (!visitFunction[args.functionName]) {
          throw new Error(`Method ${args.functionName} not found`)
        }

        return visitFunction[args.functionName](extractorClass, data)
      },
      [args.functionName]
    )

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
    useMethodAttributes,
    useMethodNames,
    useMethod,
    useQueryCall,
    useUpdateCall,
    useActorState,
    useVisitMethod,
    useVisitService,
    useActorInterface,
  }
}
