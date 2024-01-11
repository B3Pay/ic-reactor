import type {
  ActorSubclass,
  ExtractActorMethodArgs,
  ActorManager,
  ExtractedService,
  ExtractedFunction,
} from "@ic-reactor/store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ActorCallArgs,
  ActorHookState,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
} from "../types"
import { useStore } from "zustand"

export const getActorHooks = <A extends ActorSubclass<any>>({
  serviceFields,
  canisterId,
  actorStore,
  callMethod,
}: ActorManager<A>) => {
  const useActorStore = () => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState, canisterId }
  }

  const useServiceField = (): ExtractedService<A> => {
    return serviceFields
  }

  const useMethodFields = (): ExtractedFunction<A>[] => {
    const methodFields = useServiceField()

    return methodFields.fields
  }

  const useMethodField = (
    functionName: keyof A & string
  ): ExtractedFunction<A> | undefined => {
    const methodFields = useMethodFields()

    const field = useMemo(() => {
      return methodFields.find((field) => field.functionName === functionName)
    }, [methodFields, functionName])

    return field
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
      async (replaceArgs?: ExtractActorMethodArgs<A[M]>) => {
        onLoading?.(true)
        onError?.(undefined)
        setState((prevState) => ({
          ...prevState,
          loading: true,
          error: undefined,
        }))

        try {
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
    autoRefresh,
    refreshInterval = 5000,
    disableInitialCall,
    ...rest
  }: ActorUseQueryArgs<A, M>) => {
    const { call, ...state } = useReActorCall(rest)

    let intervalId = useRef<NodeJS.Timeout | undefined>(undefined)

    useEffect(() => {
      // Auto-refresh logic
      if (autoRefresh) {
        intervalId.current = setInterval(() => {
          call()
        }, refreshInterval)
      }

      // Initial call logic
      if (!disableInitialCall) {
        call()
      }

      return () => {
        clearInterval(intervalId.current)
      }
    }, [disableInitialCall, autoRefresh, refreshInterval])

    return { call, ...state }
  }

  const useUpdateCall = <M extends keyof A>(args: ActorUseUpdateArgs<A, M>) => {
    return useReActorCall(args)
  }

  return {
    useQueryCall,
    useUpdateCall,
    useActorStore,
    useMethodField,
    useMethodFields,
    useServiceField,
  }
}
