/* eslint-disable no-console */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActorHookState,
  type ActorCall,
  type UseActorStoreReturn,
  ActorQueryCall,
  ActorUpdateCall,
  ActorHooks,
  ActorUseMethodCallReturn,
  ActorUseMethodCallArg,
} from "../types"
import { useStore } from "zustand"
import { ActorManager, VisitService } from "@ic-reactor/core"
import { ActorMethodArgs, FunctionName } from "@ic-reactor/core"

const DEFAULT_STATE = {
  data: undefined,
  error: undefined,
  loading: false,
}

export const getActorHooks = <A>({
  initialize,
  canisterId,
  actorStore,
  callMethod,
  visitFunction,
}: ActorManager<A>): ActorHooks<A, true> => {
  const useActorState = (): UseActorStoreReturn<A> => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState, canisterId } as UseActorStoreReturn<A>
  }

  const useVisitFunction = (): VisitService<A> => {
    return visitFunction
  }

  const useVisitMethod = <M extends FunctionName<A>>(
    functionName: M
  ): VisitService<A>[M] => {
    const serviceFields = useVisitFunction()

    return useMemo(() => {
      return serviceFields[functionName]
    }, [functionName, serviceFields])
  }

  const useReActorCall: ActorCall<A> = ({
    onError,
    onSuccess,
    onLoading,
    args = [],
    functionName,
    throwOnError = false,
  }) => {
    type M = typeof functionName

    const [state, setState] = useState<ActorHookState<A, M>>(DEFAULT_STATE)

    const reset = useCallback(() => setState(DEFAULT_STATE), []) as () => void

    const call = useCallback(
      async (eventOrReplaceArgs?: React.MouseEvent | ActorMethodArgs<A[M]>) => {
        onLoading?.(true)
        onError?.(undefined)
        setState((prevState) => ({
          ...prevState,
          loading: true,
          error: undefined,
        }))

        try {
          const replaceArgs: ActorMethodArgs<A[M]> | undefined =
            eventOrReplaceArgs !== undefined
              ? (eventOrReplaceArgs as ActorMethodArgs<A[M]>).length > 0
                ? (eventOrReplaceArgs as ActorMethodArgs<A[M]>)
                : undefined
              : undefined

          const data = await callMethod(
            functionName,
            ...((replaceArgs ?? args) as ActorMethodArgs<A[M]>)
          )

          onLoading?.(false)
          onSuccess?.(data)
          setState((prevState) => ({ ...prevState, data, loading: false }))

          return data
        } catch (error) {
          console.error("Error in call:", error)
          onError?.(error as Error)
          onLoading?.(false)
          setState((prevState) => ({
            ...prevState,
            error: error as Error,
            loading: false,
          }))

          if (throwOnError) throw error
        }
      },
      [args, functionName, onError, onSuccess, onLoading]
    )

    return { call, reset, ...state }
  }

  const useQueryCall: ActorQueryCall<A> = ({
    refetchOnMount = true,
    refetchInterval = false,
    ...rest
  }) => {
    const { call, ...state } = useReActorCall(rest)

    const intervalId = useRef<NodeJS.Timeout | undefined>(undefined)

    useEffect(() => {
      // Auto-refresh logic
      if (refetchInterval) {
        intervalId.current = setInterval(() => {
          call()
        }, refetchInterval)
      }

      // Initial call logic
      if (refetchOnMount) {
        call()
      }

      return () => {
        clearInterval(intervalId.current)
      }
    }, [refetchOnMount, refetchInterval])

    return { call, ...state }
  }

  const useUpdateCall: ActorUpdateCall<A> = (args) => {
    return useReActorCall(args)
  }

  const useMethodCall = <M extends FunctionName<A>>(
    args: ActorUseMethodCallArg<A, M>
  ): ActorUseMethodCallReturn<A, M, true> => {
    const visit = visitFunction[args.functionName]

    return { visit, ...useReActorCall(args) }
  }

  return {
    initialize,
    useQueryCall,
    useUpdateCall,
    useVisitMethod,
    useActorState,
    useMethodCall,
  }
}
