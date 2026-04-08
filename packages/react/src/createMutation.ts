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
// Internal helpers
// ============================================================================

/** Invalidate a list of query keys in parallel, filtering out undefineds. */
async function invalidateAll(
  queryClient: Reactor<any, any>["queryClient"],
  keys: (import("@tanstack/react-query").QueryKey | undefined)[]
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) =>
      queryKey ? queryClient.invalidateQueries({ queryKey }) : Promise.resolve()
    )
  )
}

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
    invalidateQueries: factoryInvalidateQueries,
    onSuccess: factoryOnSuccess,
    onCanisterError: factoryOnCanisterError,
    onError: factoryOnError,
    ...factoryOptions
  } = config

  /**
   * Raw call without any invalidation logic.
   * Used as mutationFn so that onSuccess handles all post-mutation work
   * and there is no double-invalidation.
   */
  const callFn = (
    args: ReactorArgs<A, M, T>
  ): Promise<ReactorReturnOk<A, M, T>> =>
    reactor.callMethod({ functionName, args, callConfig })

  /**
   * Imperative execution for non-React usage.
   * Calls the canister method and invalidates factory-level queries.
   * Use this in route loaders, scripts, or server-side code.
   */
  const execute = async (
    args: ReactorArgs<A, M, T>
  ): Promise<ReactorReturnOk<A, M, T>> => {
    const result = await callFn(args)
    if (factoryInvalidateQueries) {
      await invalidateAll(reactor.queryClient, factoryInvalidateQueries)
    }
    return result
  }

  // Hook implementation
  const useMutationHook = (options?: MutationHookOptions<A, M, T>) => {
    const baseOptions = reactor.getQueryOptions({ functionName })
    const {
      invalidateQueries: hookInvalidateQueries,
      onCanisterError: hookOnCanisterError,
      ...restOptions
    } = options ?? {}

    return useMutation(
      {
        mutationKey: baseOptions.queryKey,
        ...factoryOptions,
        ...restOptions,
        // Use callFn (not execute) to avoid double-invalidation:
        // factoryInvalidateQueries are handled in onSuccess below.
        mutationFn: callFn,
        onSuccess: async (...args) => {
          // 1. Factory-level invalidation
          if (factoryInvalidateQueries) {
            await invalidateAll(reactor.queryClient, factoryInvalidateQueries)
          }
          // 2. Hook-level invalidation
          if (hookInvalidateQueries) {
            await invalidateAll(reactor.queryClient, hookInvalidateQueries)
          }
          // 3. Factory onSuccess
          await factoryOnSuccess?.(...args)
          // 4. Hook onSuccess
          await restOptions.onSuccess?.(...args)
        },
        onError: (error, variables, context, mutation) => {
          if (isCanisterError(error)) {
            factoryOnCanisterError?.(error, variables)
            hookOnCanisterError?.(error, variables)
          }
          factoryOnError?.(error, variables, context, mutation)
          restOptions.onError?.(error, variables, context, mutation)
        },
      },
      reactor.queryClient
    )
  }

  return { useMutation: useMutationHook, execute }
}

// ============================================================================
// Public Factory Function
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
