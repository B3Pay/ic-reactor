import { useMemo, useCallback } from "react"
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  QueryKey,
} from "@tanstack/react-query"
import {
  Reactor,
  ReactorArgs,
  ReactorReturnOk,
  FunctionName,
  TransformKey,
  ReactorReturnErr,
  isCanisterError,
  CanisterError,
  ErrResult,
  ActorMethodReturnType,
  TransformReturnRegistry,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"

export interface UseActorMutationParameters<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>
  >,
  "mutationFn"
> {
  reactor: Reactor<Service, Transform>
  functionName: Method
  callConfig?: CallConfig
  invalidateQueries?: QueryKey[]
  /**
   * Callback for canister-level business logic errors.
   * Called when the canister returns a Result { Err: E } variant.
   * Separate from `onError`, which fires for all errors including network failures.
   */
  onCanisterError?: (
    error: CanisterError<
      TransformReturnRegistry<
        ErrResult<ActorMethodReturnType<Service[Method]>>
      >[Transform]
    >,
    variables: ReactorArgs<Service, Method, Transform>
  ) => void
}

export type UseActorMutationConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = Omit<UseActorMutationParameters<Service, Method, Transform>, "reactor">

export type UseActorMutationResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
> = UseMutationResult<
  ReactorReturnOk<Service, Method, Transform>,
  ReactorReturnErr<Service, Method, Transform>,
  ReactorArgs<Service, Method, Transform>
>

/**
 * Hook for executing mutation calls on a canister.
 * Use this for component-level mutation flows.
 * For non-React usage, prefer `createMutation(...).execute(args)`.
 *
 * @example
 * const { mutate, isPending } = useActorMutation({
 *   reactor,
 *   functionName: "transfer",
 *   onSuccess: () => console.log("Success!"),
 *   onCanisterError: (err) => console.error("Canister Err:", err.code),
 * })
 *
 * @example
 * const transferMutation = createMutation(reactor, {
 *   functionName: "transfer",
 *   onCanisterError: (err) => console.error(err.code),
 * })
 *
 * // Non-React execution path
 * await transferMutation.execute([{ to: "aaaaa-aa", amount: "100" }])
 */
export const useActorMutation = <
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
>({
  reactor,
  functionName,
  invalidateQueries,
  onSuccess,
  onError,
  onCanisterError,
  callConfig,
  ...options
}: UseActorMutationParameters<
  Service,
  Method,
  Transform
>): UseActorMutationResult<Service, Method, Transform> => {
  const mutationFn = useCallback(
    async (args: ReactorArgs<Service, Method, Transform>) =>
      reactor.callMethod({ functionName, callConfig, args }),
    [reactor, functionName, callConfig]
  )

  const handleSuccess = useCallback(
    async (
      ...params: Parameters<
        NonNullable<
          UseMutationOptions<
            ReactorReturnOk<Service, Method, Transform>,
            ReactorReturnErr<Service, Method, Transform>,
            ReactorArgs<Service, Method, Transform>
          >["onSuccess"]
        >
      >
    ) => {
      if (invalidateQueries) {
        await Promise.all(
          invalidateQueries.map((queryKey) =>
            reactor.queryClient.invalidateQueries({ queryKey })
          )
        )
      }
      await onSuccess?.(...params)
    },
    [reactor, invalidateQueries, onSuccess]
  )

  const handleError = useCallback(
    (
      error: ReactorReturnErr<Service, Method, Transform>,
      variables: ReactorArgs<Service, Method, Transform>,
      context: unknown,
      mutation: unknown
    ) => {
      if (isCanisterError(error)) {
        onCanisterError?.(error as any, variables)
      }
      onError?.(error, variables, context as any, mutation as any)
    },
    [onCanisterError, onError]
  )

  const mutationOptions = useMemo(
    () => ({
      ...options,
      mutationFn,
      onSuccess: handleSuccess,
      onError: handleError,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutationFn, handleSuccess, handleError]
  )

  return useMutation(mutationOptions, reactor.queryClient)
}
