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
import { ActorManager, ExtractedService, FunctionType } from "@ic-reactor/store"
import { ExtractActorMethodArgs, FunctionName } from "@ic-reactor/store"

const DEFAULT_STATE = {
  data: undefined,
  error: undefined,
  loading: false,
}

export const getActorHooks = <A>({
  initialize,
  visitFunction,
  canisterId,
  actorStore,
  callMethod,
}: ActorManager<A>): ActorHooks<A, true> => {
  const useActorStore = (): UseActorStoreReturn<A> => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState, canisterId } as UseActorStoreReturn<A>
  }

  const useVisitFunction = (): ExtractedService<A> => {
    return visitFunction
  }

  const useMethodField = <M extends FunctionName<A>>(
    functionName: M
  ): ExtractedService<A>[M] => {
    const serviceFields = useVisitFunction()

    return useMemo(() => {
      return serviceFields[functionName]
    }, [functionName, serviceFields])
  }

  const useReActorCall: ActorCall<A> = ({
    onError,
    onSuccess,
    onLoading,
    args = [] as unknown as ExtractActorMethodArgs<A[any]>,
    functionName,
    throwOnError = false,
  }) => {
    type M = typeof functionName

    const [state, setState] = useState<ActorHookState<A, M>>(DEFAULT_STATE)

    const reset = useCallback(() => setState(DEFAULT_STATE), []) as () => void

    const call = useCallback(
      async (
        eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
      ) => {
        onLoading?.(true)
        onError?.(undefined)
        setState((prevState) => ({
          ...prevState,
          loading: true,
          error: undefined,
        }))

        try {
          const replaceArgs: ExtractActorMethodArgs<A[M]> | undefined =
            eventOrReplaceArgs !== undefined
              ? (eventOrReplaceArgs as ExtractActorMethodArgs<A[M]>).length > 0
                ? (eventOrReplaceArgs as ExtractActorMethodArgs<A[M]>)
                : undefined
              : undefined

          const data = await callMethod(functionName, ...(replaceArgs ?? args))

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

    return { call, reset, ...state } as any
  }

  const useQueryCall: ActorQueryCall<A> = ({
    refetchOnMount = false,
    refetchInterval = false,
    ...rest
  }) => {
    const { call, ...state } = useReActorCall(rest as any)

    let intervalId = useRef<NodeJS.Timeout | undefined>(undefined)

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

    return { call, ...state } as any
  }

  const useUpdateCall: ActorUpdateCall<A> = (args) => {
    return useReActorCall(args as any) as any
  }

  const useMethodCall = <M extends FunctionName<A>, T extends FunctionType>(
    args: ActorUseMethodCallArg<A, T>
  ): ActorUseMethodCallReturn<A, M, true> => {
    //   const { functionName } = args
    //   const field = useMemo(
    //     () => serviceFields?.methodFields[functionName],
    //     [functionName]
    //   ) as MethodFields<A>
    //   const detail = useMemo(
    //     () => serviceDetails?.methodDetails[functionName],
    //     [functionName]
    //   ) as MethodDetails<A>
    //   const generateArgs = useCallback(() => {
    //     const randomClass = new ExtractRandomArgs()
    //     return randomClass.generate(field.argTypes, functionName)
    //   }, [field, functionName])
    //   const generateReturns = useCallback(() => {
    //     const randomClass = new ExtractRandomReturns()
    //     const data = randomClass.generate(field.returnTypes)
    //     console.log("generateReturns", data, field.returnTypes)
    //     return transformResult(functionName, data.length > 1 ? data : data[0])
    //   }, [field, functionName])
    //   const type = field.functionType ?? detail.functionType
    //   switch (type) {
    //     case "query":
    //       return {
    //         field,
    //         detail,
    //         generateArgs,
    //         generateReturns,
    //         ...useQueryCall<M>(args as any),
    //       }
    //     case "update":
    //       return {
    //         field,
    //         detail,
    //         generateArgs,
    //         generateReturns,
    //         ...useUpdateCall<M>(args as any),
    //       }
    //     default:
    //       throw new Error(`Invalid type: ${type}`)
    //   }

    return { args } as any
  }

  return {
    initialize,
    useQueryCall,
    useUpdateCall,
    useMethodField,
    useActorStore,
    useMethodCall,
  }
}
