/**
 * Mutation Factory - Generic wrapper for mutating canister data
 *
 * Creates unified mutation hooks for any canister method.
 * Works with any Reactor instance.
 *
 * @example
 * const transferMutation = createMutation(reactor, {
 *   functionName: "transfer",
 *   onSuccess: () => console.log("Success!"),
 * })
 *
 * // In component
 * const { mutate, isPending } = transferMutation.useMutation()
 */

import { useMutation } from "@tanstack/react-query"
import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  TransformKey,
  ReactorReturnOk,
} from "@ic-reactor/core"
import { isCanisterError } from "@ic-reactor/core"
import type {
  MutationConfig,
  MutationResult,
  MutationHookOptions,
  NoInfer,
} from "./types"

// ============================================================================
// Internal Implementation
// ============================================================================

const createMutationImpl = <
  A,
  M extends FunctionName<A> = FunctionName<A>,
  T extends TransformKey = "candid",
>(
  reactor: Reactor<A, T>,
  config: MutationConfig<A, M, T>
): MutationResult<A, M, T> => {
  const {
    functionName,
    callConfig,
    refetchQueries: factoryRefetchQueries,
    onSuccess: factoryOnSuccess,
    onCanisterError: factoryOnCanisterError,
    onError: factoryOnError,
    ...factoryOptions
  } = config

  // Direct execution function
  const execute = async (
    args: ReactorArgs<A, M, T>
  ): Promise<ReactorReturnOk<A, M, T>> => {
    return reactor.callMethod({
      functionName,
      args,
      callConfig,
    })
  }

  // Hook implementation
  const useMutationHook = (options?: MutationHookOptions<A, M, T>) => {
    // Extract our custom options
    const {
      refetchQueries: hookRefetchQueries,
      onCanisterError: hookOnCanisterError,
      ...restOptions
    } = options || {}

    return useMutation(
      {
        ...factoryOptions,
        ...restOptions,
        mutationFn: execute,
        onSuccess: async (...args) => {
          // 1. Handle factory-level refetchQueries
          if (factoryRefetchQueries) {
            await Promise.all(
              factoryRefetchQueries.map((queryKey) => {
                return reactor.queryClient.refetchQueries({ queryKey })
              })
            )
          }

          // 2. Handle hook-level refetchQueries
          if (hookRefetchQueries) {
            await Promise.all(
              hookRefetchQueries.map((queryKey) => {
                if (queryKey) {
                  return reactor.queryClient.refetchQueries({ queryKey })
                }
                return Promise.resolve()
              })
            )
          }

          // 3. Call factory onSuccess
          if (factoryOnSuccess) {
            await factoryOnSuccess(...args)
          }

          // 4. Call hook-local onSuccess
          if (restOptions?.onSuccess) {
            await restOptions.onSuccess(...args)
          }
        },
        onError: (error, variables, context, mutation) => {
          // Check if this is a CanisterError (from Result { Err: E })
          if (isCanisterError(error)) {
            // 1. Call factory-level onCanisterError
            if (factoryOnCanisterError) {
              factoryOnCanisterError(error, variables)
            }
            // 2. Call hook-level onCanisterError
            if (hookOnCanisterError) {
              hookOnCanisterError(error, variables)
            }
          }

          // 3. Call factory-level onError (for all errors)
          if (factoryOnError) {
            factoryOnError(error, variables, context, mutation)
          }

          // 4. Call hook-level onError (for all errors)
          if (restOptions?.onError) {
            restOptions.onError(error, variables, context, mutation)
          }
        },
      },
      reactor.queryClient
    )
  }

  return {
    useMutation: useMutationHook,
    execute,
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMutation<
  A,
  T extends TransformKey,
  M extends FunctionName<A> = FunctionName<A>,
>(
  reactor: Reactor<A, T>,
  config: MutationConfig<NoInfer<A>, M, T>
): MutationResult<A, M, T> {
  return createMutationImpl(reactor, config as MutationConfig<A, M, T>)
}
