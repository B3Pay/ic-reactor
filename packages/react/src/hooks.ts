import {
  ActorSubclass,
  CallMethod,
  ExtractReActorMethodArgs,
  ReActorActorStore,
  ReActorMethodField,
} from "@ic-reactor/store"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ReActorCallArgs,
  ReActorHookState,
  ReActorUseQueryArgs,
  ReActorUseUpdateArgs,
} from "./types"

export const getCallHooks = <A extends ActorSubclass<any>>(
  callMethod: CallMethod<A>,
  actorStore: ReActorActorStore<A>
) => {
  const useField = (functionName: keyof A & string) => {
    const [field, setField] = useState<ReActorMethodField<A> | undefined>(
      undefined
    )

    useEffect(() => {
      const unsubscribe = actorStore.subscribe((state) => {
        if (state.methodFields) {
          const field = state.methodFields.find(
            (f) => f.functionName === functionName
          )
          setField(field)
        }
      })

      return () => {
        unsubscribe()
      }
    }, [functionName])

    return { current: field }
  }

  const useReActorCall = <M extends keyof A>({
    onError,
    onSuccess,
    onLoading,
    args = [] as unknown as ExtractReActorMethodArgs<A[M]>,
    functionName,
  }: ReActorCallArgs<A, M>) => {
    const [state, setState] = useState<ReActorHookState<A, M>>({
      data: undefined,
      error: undefined,
      loading: false,
    })

    const call = useCallback(
      async (replaceArgs?: ExtractReActorMethodArgs<A[M]>) => {
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
        }
      },
      [args, functionName, onError, onSuccess, onLoading]
    )

    const field = useField(functionName)

    return { call, field, ...state }
  }

  const useQueryCall = <M extends keyof A>({
    autoRefresh,
    refreshInterval = 5000,
    disableInitialCall,
    ...rest
  }: ReActorUseQueryArgs<A, M>) => {
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

  const useUpdateCall = <M extends keyof A>(
    args: ReActorUseUpdateArgs<A, M>
  ) => {
    return useReActorCall(args)
  }

  return {
    useField,
    useQueryCall,
    useUpdateCall,
  }
}
