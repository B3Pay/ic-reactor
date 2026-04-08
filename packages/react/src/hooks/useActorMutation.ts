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
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    ReactorArgs<A, M, T>
  >,
  "mutationFn"
> {
  reactor: Reactor<A, T>
  functionName: M
  callConfig?: CallConfig
  invalidateQueries?: QueryKey[]
  /**
   * Callback for canister-level business logic errors.
   * Called when the canister returns a Result { Err: E } variant.
   * Separate from `onError`, which fires for all errors including network failures.
   */
  onCanisterError?: (
    error: CanisterError<
      TransformReturnRegistry<ErrResult<ActorMethodReturnType<A[M]>>>[T]
    >,
    variables: ReactorArgs<A, M, T>
  ) => void
}

export type UseActorMutationConfig<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
> = Omit<UseActorMutationParameters<A, M, T>, "reactor">

export type UseActorMutationResult<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
> = UseMutationResult<
  ReactorReturnOk<A, M, T>,
  ReactorReturnErr<A, M, T>,
  ReactorArgs<A, M, T>
>

/**
 * Hook for executing mutation calls on a canister.
 *
 * @example
 * const { mutate, isPending } = useActorMutation({
 *   reactor,
 *   functionName: "transfer",
 *   onSuccess: () => console.log("Success!"),
 *   onCanisterError: (err) => console.error("Canister Err:", err.code),
 * })
 */
export const useActorMutation = <
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
>({
  reactor,
  functionName,
  invalidateQueries,
  onSuccess,
  onError,
  onCanisterError,
  callConfig,
  ...options
}: UseActorMutationParameters<A, M, T>): UseActorMutationResult<A, M, T> => {
  const mutationFn = useCallback(
    async (args: ReactorArgs<A, M, T>) =>
      reactor.callMethod({ functionName, callConfig, args }),
    [reactor, functionName, callConfig]
  )

  const handleSuccess = useCallback(
    async (
      ...params: Parameters<
        NonNullable<
          UseMutationOptions<
            ReactorReturnOk<A, M, T>,
            ReactorReturnErr<A, M, T>,
            ReactorArgs<A, M, T>
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
      error: ReactorReturnErr<A, M, T>,
      variables: ReactorArgs<A, M, T>,
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
