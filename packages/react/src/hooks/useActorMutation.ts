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
  refetchQueries?: QueryKey[]
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
 * })
 */
export const useActorMutation = <
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
>({
  reactor,
  functionName,
  refetchQueries,
  onSuccess,
  callConfig,
  ...options
}: UseActorMutationParameters<A, M, T>): UseActorMutationResult<A, M, T> => {
  // Memoize mutationFn to avoid creating new function on every render
  const mutationFn = useCallback(
    async (args: ReactorArgs<A, M, T>) => {
      return reactor.callMethod({
        functionName,
        callConfig,
        args,
      })
    },
    [reactor, functionName, callConfig]
  )

  // Memoize onSuccess handler
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
      if (refetchQueries) {
        await Promise.all(
          refetchQueries.map((queryKey) =>
            reactor.queryClient.refetchQueries({ queryKey })
          )
        )
      }
      if (onSuccess) {
        await onSuccess(...params)
      }
    },
    [reactor, refetchQueries, onSuccess]
  )

  // Memoize mutation options
  const mutationOptions = useMemo(
    () => ({
      ...options,
      mutationFn,
      onSuccess: handleSuccess,
    }),
    [options, mutationFn, handleSuccess]
  )

  return useMutation(mutationOptions, reactor.queryClient)
}
