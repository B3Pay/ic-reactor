import type {
  ActorSubclass,
  ExtractActorMethodArgs,
  ActorManager,
  ExtractedService,
  ExtractedFunction,
  ServiceMethodType,
  ServiceMethodTypeAndName,
} from "@ic-reactor/store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ActorCallArgs,
  ActorHookState,
  ActorUseMethodArg,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
} from "../types"
import { useStore } from "zustand"

export type ActorHooks<A extends ActorSubclass<any>> = ReturnType<
  typeof getActorHooks<A>
>

export const getActorHooks = <A extends ActorSubclass<any>>({
  initialize,
  serviceFields,
  canisterId,
  actorStore,
  callMethod,
}: ActorManager<A>) => {
  const useActorStore = () => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState, canisterId }
  }

  const useServiceFields = (): ExtractedService<A> => {
    return serviceFields
  }

  const useMethodNames = (): ServiceMethodTypeAndName<A>[] => {
    const serviceField = useServiceFields()

    return serviceField.methodNames
  }

  const useMethodFields = (): ExtractedFunction<A>[] => {
    const methodFields = useServiceFields()

    return useMemo(() => {
      return Object.values(methodFields.methods)
    }, [methodFields])
  }

  const useMethodField = (
    functionName: keyof A & string
  ): ExtractedFunction<A> => {
    const serviceMethod = useServiceFields()

    return useMemo(
      () => serviceMethod.methods[functionName],
      [functionName, serviceMethod]
    )
  }

  const useReActorCall = <M extends keyof A>({
    onError,
    onSuccess,
    onLoading,
    args = [] as unknown as ExtractActorMethodArgs<A[M]>,
    functionName,
    throwOnError = false,
  }: ActorCallArgs<A, M>) => {
    const [state, setState] = useState<ActorHookState<A, M>>({
      data: undefined,
      error: undefined,
      loading: false,
    })

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

    const field = useMethodField(functionName)

    return { call, field, ...state }
  }

  const useQueryCall = <M extends keyof A>({
    refetchOnMount = false,
    refetchInterval = false,
    ...rest
  }: ActorUseQueryArgs<A, M>) => {
    const { call, ...state } = useReActorCall(rest)

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

    return { call, ...state }
  }

  const useUpdateCall = <M extends keyof A>(args: ActorUseUpdateArgs<A, M>) => {
    return useReActorCall(args)
  }

  const useMethodCall = <M extends keyof A, T extends ServiceMethodType>({
    type,
    ...rest
  }: ActorUseMethodArg<A, T> & { type: T }) => {
    switch (type) {
      case "query":
        return useQueryCall<M>(rest as unknown as ActorUseQueryArgs<A, M>)
      case "update":
        return useUpdateCall<M>(rest as unknown as ActorUseUpdateArgs<A, M>)
      default:
        throw new Error(`Invalid type: ${type}`)
    }
  }

  return {
    initialize,
    useQueryCall,
    useUpdateCall,
    useMethodCall,
    useActorStore,
    useMethodField,
    useMethodFields,
    useMethodNames,
    useServiceFields,
  }
}
