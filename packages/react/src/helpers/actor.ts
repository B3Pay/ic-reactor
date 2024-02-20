import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useStore } from "zustand"
import type {
  ActorCallState,
  ReactorCall,
  UseActorState,
  UseQueryCall,
  UseUpdateCall,
  UseMethodCallReturn,
  UseMethodCallArg,
  ActorHooks,
} from "../types"
import type {
  VisitService,
  ActorMethodArgs,
  FunctionName,
  BaseActor,
} from "@ic-reactor/core/dist/types"
import { ActorManager } from "@ic-reactor/core"

const DEFAULT_STATE: ActorCallState<never, never> = {
  data: undefined,
  error: undefined,
  loading: false,
}

export const getActorHooks = <A = BaseActor>(
  actorManager: ActorManager<A>
): ActorHooks<A> => {
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
        setState({ data: undefined, error: undefined, loading: true })
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
      [args, functionName, events, callMethod]
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
      if (refetchInterval)
        intervalId.current = setInterval(call, refetchInterval)
      return () => clearInterval(intervalId.current)
    }, [refetchInterval, call])

    useLayoutEffect(() => {
      if (refetchOnMount) call()
    }, [call, refetchOnMount])

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
