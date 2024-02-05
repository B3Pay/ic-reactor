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
import {
  ActorHookState,
  type ActorCall,
  type ActorHooks,
  type ActorUseMethodCallArg,
  type ActorUseMethodCallReturn,
  type UseActorStoreReturn,
  ActorQueryCall,
  ActorUpdateCall,
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
  transformResult,
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

  const useReActorCall: ActorCall<A> = ({
    onError,
    onSuccess,
    onLoading,
    args = [] as unknown as ExtractActorMethodArgs<A[any]>,
    functionName,
    withTransform,
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

          const result = await callMethod(
            functionName,
            ...(replaceArgs ?? args)
          )

          const data = withTransform
            ? transformResult(functionName, result)
            : result

          onLoading?.(false)
          onSuccess?.(result)
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
          ...useQueryCall<M>(args as any),
        }
      case "update":
        return {
          field,
          detail,
          ...useUpdateCall<M>(args as any),
        }
      default:
        throw new Error(`Invalid type: ${type}`)
    }
  }

  return {
    initialize,
    useQueryCall: useQueryCall as any,
    useUpdateCall: useUpdateCall as any,
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
