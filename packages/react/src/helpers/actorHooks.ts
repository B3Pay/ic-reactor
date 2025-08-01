import * as React from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { createCompiledResult, generateRequestHash } from "../utils"

import type {
  UseSharedCallState,
  UseSharedCall,
  UseQueryCall,
  UseUpdateCall,
  ActorHooksReturnType,
  UseMethod,
  UseMethodParameters,
  UseMethodReturnType,
  UseActorStore,
  ActorMethodReturnType,
  ExtractErr,
  ExtractOk,
} from "../types"
import {
  type VisitService,
  type ActorMethodParameters,
  type FunctionName,
  type ActorManager,
  type BaseActor,
  type IDL,
  type MethodAttributes,
  type ActorMethodState,
  type ActorState,
} from "@ic-reactor/core/dist/types"
import { AgentError } from "@dfinity/agent"

const DEFAULT_STATE: UseSharedCallState<never, never> = {
  data: undefined,
  error: undefined,
  loading: false,
  isLoading: false,
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
    callMethodWithOptions,
    initialize,
  } = actorManager

  const useActorStore: UseActorStore<A> = <T>(
    selector = (s: ActorState<A>) => s as T
  ) => {
    return useStore(actorStore, useShallow(selector))
  }

  const useActorState = () => {
    return useActorStore((state) => ({
      name: state.name,
      error: state.error,
      version: state.version,
      initialized: state.isInitialized,
      isInitialized: state.isInitialized,
      initializing: state.isInitializing,
      isInitializing: state.isInitializing,
      canisterId,
    }))
  }
  const useMethodState = <M extends FunctionName<A>>(
    functionName: M,
    requestKey: string
  ): [
    ActorMethodState<A, M>[string],
    (newState: Partial<ActorMethodState<A, M>[string]>) => void
  ] => {
    const state = useActorStore(
      (state) => state.methodState[functionName]?.[requestKey]
    )

    const setSharedState = React.useCallback(
      (newState: Partial<ActorMethodState<A, M>[string]>) => {
        updateMethodState(functionName, requestKey, newState)
      },
      [functionName, requestKey]
    )

    return [state, setSharedState]
  }

  const useMethodAttributes = <Actor = A>(): MethodAttributes<Actor> => {
    return React.useMemo(extractMethodAttributes, [
      actorManager,
    ]) as unknown as MethodAttributes<Actor>
  }

  const useMethodNames = <Actor = A>(): FunctionName<Actor>[] => {
    const methodAttributes = useMethodAttributes()
    return Object.keys(methodAttributes) as FunctionName<Actor>[]
  }

  const useActorInterface = (): IDL.ServiceClass => {
    return extractInterface()
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
    args = [] as unknown as ActorMethodParameters<A[typeof functionName]>,
    functionName,
    throwOnError = false,
    onError,
    onLoading,
    onSuccess,
    onSuccessResult,
    onErrorResult,
    ...options
  }) => {
    type M = typeof functionName
    const requestKey = React.useMemo(() => generateRequestHash(args), [args])
    const [sharedState, setSharedState] = useMethodState(
      functionName,
      requestKey
    )

    const latestDataRef = React.useRef<ActorMethodReturnType<A[M]>>(null)

    const reset = React.useCallback(() => {
      updateMethodState(functionName, requestKey, DEFAULT_STATE)
      latestDataRef.current = null
    }, [functionName, requestKey])

    const call = React.useCallback(
      async (
        eventOrReplaceArgs?: ActorMethodParameters<A[M]> | React.MouseEvent
      ) => {
        setSharedState({ error: undefined, loading: true, isLoading: true })
        onLoading?.(true)
        try {
          const replaceArgs =
            eventOrReplaceArgs instanceof Array ? eventOrReplaceArgs : args
          const data = await callMethodWithOptions(options)(
            functionName,
            ...(replaceArgs ?? args)
          )

          latestDataRef.current = data
          setSharedState({
            data,
            error: undefined,
            loading: false,
            isLoading: false,
          })

          onLoading?.(false)
          onSuccess?.(data)

          const { isOk, value, error } = createCompiledResult(data)
          if (isOk) {
            onSuccessResult?.(value as ExtractOk<ActorMethodReturnType<A[M]>>)
          } else {
            onErrorResult?.(error as ExtractErr<ActorMethodReturnType<A[M]>>)
            if (throwOnError) {
              throw error
            }
          }
          return data
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Error calling method ${functionName}:`, error)
          latestDataRef.current = null
          setSharedState({
            error: error as AgentError,
            loading: false,
            isLoading: false,
          })
          onError?.(error as AgentError)
          onLoading?.(false)
          if (throwOnError) throw error
          return undefined
        }
      },
      [
        args,
        functionName,
        options,
        onError,
        onLoading,
        onSuccess,
        onSuccessResult,
        throwOnError,
      ]
    )

    const compileResult = () => {
      return createCompiledResult(latestDataRef.current || sharedState?.data)
    }

    return {
      call,
      reset,
      compileResult,
      requestKey,
      ...sharedState,
    }
  }

  const useQueryCall: UseQueryCall<A> = ({
    refetchOnMount = true,
    refetchInterval = false,
    ...rest
  }) => {
    const { call, requestKey, ...state } = useSharedCall(rest)
    const intervalId = React.useRef<NodeJS.Timeout>(null)

    React.useEffect(() => {
      if (refetchInterval) {
        intervalId.current = setInterval(call, refetchInterval)
      }

      if (refetchOnMount && state.data === undefined) {
        call()
      } else if (refetchOnMount && state.data !== undefined) {
        rest.onSuccess?.(state.data)
        const { isOk, value, error } = createCompiledResult(state.data)
        if (isOk) {
          rest.onSuccessResult?.(
            value as ExtractOk<
              ActorMethodReturnType<A[typeof rest.functionName]>
            >
          )
        } else {
          rest.onErrorResult?.(
            error as ExtractErr<
              ActorMethodReturnType<A[typeof rest.functionName]>
            >
          )
        }
      }

      return () => {
        if (intervalId.current) {
          clearInterval(intervalId.current)
        }
      }
    }, [refetchInterval, refetchOnMount, requestKey])

    const refetch = () => {
      call()
    }

    return { call, refetch, intervalId, requestKey, ...state }
  }

  const useUpdateCall: UseUpdateCall<A> = useSharedCall

  const useMethod: UseMethod<A> = <M extends FunctionName<A>>(
    params: UseMethodParameters<A, M>
  ): UseMethodReturnType<A, M> => {
    const attributes = React.useMemo(() => {
      if (!methodAttributes[params.functionName]) {
        throw new Error(`Method ${params.functionName} not found`)
      }

      return methodAttributes[params.functionName]
    }, [params.functionName])

    const visit: VisitService<A>[M] = React.useCallback(
      (extractorClass, data) =>
        visitFunction[params.functionName](extractorClass, data),
      [params.functionName]
    )

    const validateArgs = React.useCallback(
      (
        args?: ActorMethodParameters<A[M]> | undefined,
        throwOnError = false
      ) => {
        if (attributes.numberOfArgs > 0) {
          if (args === undefined || args.length === 0) {
            if (throwOnError) {
              throw new Error(
                `Method ${params.functionName} requires ${attributes.numberOfArgs} arguments, but none were provided.`
              )
            }
            return false
          }
          try {
            attributes.validate(args as never)
            return true
          } catch (error) {
            if (throwOnError) {
              throw error
            }
            return false
          }
        }
        return true
      },
      [attributes]
    )

    let refetchOnMount = params.refetchOnMount
    let refetchInterval = params.refetchInterval
    let isFormRequired = true

    switch (attributes.type) {
      case "query":
        if (validateArgs(params.args)) {
          isFormRequired = params.refetchOnMount === false ? true : false
        } else {
          refetchOnMount = false
          refetchInterval = false
        }
        return {
          visit,
          validateArgs,
          ...useQueryCall({
            ...params,
            refetchOnMount,
            refetchInterval,
          }),
          isFormRequired,
        }
      case "update":
        return { visit, validateArgs, ...useUpdateCall(params), isFormRequired }
      default:
        throw new Error(`Method type ${attributes.type} not found`)
    }
  }

  return {
    initialize,
    useActorStore,
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
