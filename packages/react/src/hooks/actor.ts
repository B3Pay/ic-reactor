import type {
  ExtractActorMethodArgs,
  ActorManager,
  ExtractedServiceFields,
  MethodFields,
  FunctionType,
  ExtractedServiceDetails,
  ServiceDetails,
  MethodDetails,
  FunctionName,
} from "@ic-reactor/store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ActorCallArgs,
  ActorHookState,
  ActorHooks,
  ActorUseMethodCallArg,
  ActorUseMethodCallReturn,
  ActorUseQueryArgs,
  ActorUseQueryReturn,
  ActorUseUpdateArgs,
  ActorUseUpdateReturn,
  UseActorStoreReturn,
} from "../types"
import { useStore } from "zustand"

const DEFAULT_STATE = {
  data: undefined,
  error: undefined,
  loading: false,
}

export const getActorHooks = <A>({
  initialize,
  serviceFields,
  serviceDetails,
  withServiceFields,
  withServiceDetails,
  canisterId,
  actorStore,
  callMethod,
}: ActorManager<A>): ActorHooks<
  A,
  typeof withServiceFields,
  typeof withServiceDetails
> => {
  type F = typeof withServiceFields
  type D = typeof withServiceDetails

  const useActorStore = (): UseActorStoreReturn<A> => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState, canisterId }
  }

  const useServiceFields = (): ExtractedServiceFields<A> => {
    if (!withServiceFields || !serviceFields) {
      throw new Error(
        "Service fields not initialized. Pass `withServiceFields` to initialize service fields."
      )
    }

    return serviceFields
  }

  const useMethodFields = (): MethodFields<A>[] => {
    const serviceFields = useServiceFields()

    return useMemo(() => {
      return Object.values(serviceFields.methodFields)
    }, [serviceFields])
  }

  const useMethodField = (functionName: FunctionName<A>): MethodFields<A> => {
    const serviceMethod = useServiceFields()

    return useMemo(() => {
      return serviceMethod.methodFields[functionName]
    }, [functionName, serviceMethod])
  }

  const useServiceDetails = (): ExtractedServiceDetails<A> => {
    if (!withServiceDetails || !serviceDetails) {
      throw new Error(
        "Service details not initialized. Pass `withServiceDetails` to initialize service fields."
      )
    }

    return serviceDetails
  }

  const useMethodDetails = (): ServiceDetails<A> => {
    const serviceFields = useServiceDetails()

    return serviceFields.methodDetails
  }

  const useMethodDetail = (functionName: FunctionName<A>): MethodDetails<A> => {
    const serviceMethod = useServiceDetails()

    return useMemo(() => {
      return serviceMethod.methodDetails[functionName]
    }, [functionName, serviceMethod])
  }

  const useReActorCall = <M extends FunctionName<A>>({
    onError,
    onSuccess,
    onLoading,
    args = [] as unknown as ExtractActorMethodArgs<A[M]>,
    functionName,
    throwOnError = false,
  }: ActorCallArgs<A, M>) => {
    const [state, setState] = useState<ActorHookState<A, M>>(DEFAULT_STATE)

    const reset = useCallback(() => setState(DEFAULT_STATE), [])

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

    return { call, reset, ...state }
  }

  const useQueryCall = <M extends FunctionName<A>>({
    refetchOnMount = false,
    refetchInterval = false,
    ...rest
  }: ActorUseQueryArgs<A, M>): ActorUseQueryReturn<A, M> => {
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

  const useUpdateCall = <M extends FunctionName<A>>(
    args: ActorUseUpdateArgs<A, M>
  ): ActorUseUpdateReturn<A, M> => {
    return useReActorCall(args)
  }

  const useMethodCall = <M extends FunctionName<A>, T extends FunctionType>(
    args: ActorUseMethodCallArg<A, T>
  ): ActorUseMethodCallReturn<A, M, F, D> => {
    const { functionName } = args

    const field = useMemo(
      () => serviceFields?.methodFields[functionName],
      [functionName]
    ) as MethodFields<A>

    const detail = useMemo(
      () => serviceDetails?.methodDetails[functionName],
      [functionName]
    ) as MethodDetails<A>

    const type = field.functionType ?? detail.functionType

    switch (type) {
      case "query":
        return {
          field,
          detail,
          ...useQueryCall<M>(args as ActorUseQueryArgs<A, M>),
        }
      case "update":
        return {
          field,
          detail,
          ...useUpdateCall<M>(args as ActorUseUpdateArgs<A, M>),
        }
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
    // __Details
    useServiceDetails,
    useMethodDetails,
    useMethodDetail,
    // __Fields
    useServiceFields,
    useMethodFields,
    useMethodField,
  }
}
