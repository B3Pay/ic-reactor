import type {
  ActorSubclass,
  ExtractActorMethodArgs,
  ActorManager,
  ExtractedService,
  ExtractedFunction,
  ExtractedFunctionType,
  ServiceMethodInformations,
  ServiceMethodDetails,
} from "@ic-reactor/store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ActorCallArgs,
  ActorHookState,
  ActorHooks,
  ActorUseMethodArg,
  ActorUseQueryArgs,
  ActorUseQueryReturn,
  ActorUseUpdateArgs,
  ActorUseUpdateReturn,
  UseActorStoreReturn,
} from "../types"
import { useStore } from "zustand"

export const getActorHooks = <A extends ActorSubclass<any>>({
  initialize,
  serviceFields,
  withServiceFields,
  canisterId,
  actorStore,
  callMethod,
}: ActorManager<A>): ActorHooks<A, typeof withServiceFields> => {
  type W = typeof withServiceFields

  const useActorStore = (): UseActorStoreReturn<A> => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState, canisterId }
  }

  const useServiceFields = (): ExtractedService<A> => {
    if (!withServiceFields || !serviceFields) {
      throw new Error(
        "Service fields not initialized. Pass `withServiceFields` to initialize service fields."
      )
    }

    return serviceFields
  }

  const useMethodInformation = (): ServiceMethodInformations<A> => {
    const serviceFields = useServiceFields()

    return useMemo(() => {
      return serviceFields.methodInformation
    }, [serviceFields])
  }

  const useMethodFields = (): ExtractedFunction<A>[] => {
    const serviceFields = useServiceFields()

    return useMemo(() => {
      return Object.values(serviceFields.methodFields)
    }, [serviceFields])
  }

  const useMethodField = (
    functionName: keyof A & string
  ): ExtractedFunction<A> => {
    const serviceMethod = useServiceFields()

    return useMemo(() => {
      return serviceMethod.methodFields[functionName]
    }, [functionName, serviceMethod])
  }

  const useMethodDetails = (): ServiceMethodDetails<A> => {
    const serviceFields = useServiceFields()

    return serviceFields.methodDetails
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

    const field = useMemo(() => {
      return serviceFields?.methodFields[functionName]
    }, [functionName]) as ExtractedFunction<A>

    return { call, field, ...state }
  }

  const useQueryCall = <M extends keyof A>({
    refetchOnMount = false,
    refetchInterval = false,
    ...rest
  }: ActorUseQueryArgs<A, M>): ActorUseQueryReturn<A, M, W> => {
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

  const useUpdateCall = <M extends keyof A>(
    args: ActorUseUpdateArgs<A, M>
  ): ActorUseUpdateReturn<A, M, W> => {
    return useReActorCall(args)
  }

  const useMethodCall = <M extends keyof A, T extends ExtractedFunctionType>({
    type,
    ...rest
  }: ActorUseMethodArg<A, T> & { type: T }): T extends "query"
    ? ActorUseQueryReturn<A, M, W>
    : ActorUseUpdateReturn<A, M, W> => {
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
    useMethodInformation,
    useMethodDetails,
    useMethodField,
    useMethodFields,
    useServiceFields,
  }
}
