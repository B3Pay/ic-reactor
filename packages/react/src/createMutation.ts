/**
 * Mutation Factory - Generic wrapper for mutating canister data
 *
 * Creates unified mutation hooks for any canister method.
 * Works with any Reactor instance.
 * Use this when one mutation should support both React hooks and imperative
 * execution outside React.
 *
 * @example
 * const transferMutation = createMutation(reactor, {
 *   functionName: "transfer",
 *   onSuccess: () => console.log("Success!"),
 * })
 *
 * // In component
 * const { mutate, isPending } = transferMutation.useMutation()
 *
 * @example
 * const transferMutation = createMutation(reactor, {
 *   functionName: "transfer",
 *   onCanisterError: (err) => console.error(err.code),
 * })
 *
 * // Outside React (loader/service/script)
 * await transferMutation.execute([{ to: "aaaaa-aa", amount: "1000" }])
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
} from "./types.js"

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
  Service,
  Method extends FunctionName<Service> = FunctionName<Service>,
  Transform extends TransformKey = "candid",
>(
  reactor: Reactor<Service, Transform>,
  config: MutationConfig<Service, Method, Transform>
): MutationResult<Service, Method, Transform> => {
  const {
    functionName,
    callConfig,
    invalidateQueries: factoryInvalidateQueries,
    onSuccess: factoryOnSuccess,
    onCanisterError: factoryOnCanisterError,
    onError: factoryOnError,
    onMutate: factoryOnMutate,
    onSettled: factoryOnSettled,
    ...factoryOptions
  } = config

  /**
   * Raw call without any invalidation logic.
   * Used as mutationFn so that onSuccess handles all post-mutation work
   * and there is no double-invalidation.
   */
  const callFn = (
    args: ReactorArgs<Service, Method, Transform>
  ): Promise<ReactorReturnOk<Service, Method, Transform>> =>
    reactor.callMethod({ functionName, args, callConfig })

  /**
   * Imperative execution for non-React usage.
   *
   * Runs the same factory-level chain the hook does — invalidation, then
   * `onSuccess`, or `onCanisterError`/`onError` on failure — so a mutation
   * object behaves the same through both call paths. Only hook-level callbacks
   * are absent, because there is no hook here to supply them.
   *
   * The error is rethrown after the callbacks run, so `await execute(...)`
   * still rejects for the caller.
   *
   * Use this in route loaders, scripts, or server-side code.
   */
  const execute = async (
    args: ReactorArgs<Service, Method, Transform>
  ): Promise<ReactorReturnOk<Service, Method, Transform>> => {
    let result: ReactorReturnOk<Service, Method, Transform>
    try {
      result = await callFn(args)
    } catch (error) {
      if (isCanisterError(error)) {
        factoryOnCanisterError?.(error, args)
      }
      // No mutation context or instance exists on the imperative path.
      factoryOnError?.(
        error as Parameters<NonNullable<typeof factoryOnError>>[0],
        args,
        undefined as never,
        undefined as never
      )
      throw error
    }

    if (factoryInvalidateQueries) {
      await invalidateAll(reactor.queryClient, factoryInvalidateQueries)
    }
    await factoryOnSuccess?.(
      result,
      args,
      undefined as never,
      undefined as never
    )
    return result
  }

  // Hook implementation
  const useMutationHook = (
    options?: MutationHookOptions<Service, Method, Transform>
  ) => {
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
        // `onMutate` and `onSettled` are composed like `onSuccess`/`onError`
        // above. They used to arrive through the `...restOptions` spread, so a
        // hook-level one silently replaced the factory's — factory teardown,
        // telemetry or logging simply vanished the moment any call site passed
        // its own, with no warning and no type error. Chaining is what a
        // reader who has seen `onSuccess` chain already expects.
        onMutate: async (...params) => {
          await factoryOnMutate?.(...params)
          return await restOptions.onMutate?.(...params)
        },
        onSettled: async (...params) => {
          await factoryOnSettled?.(...params)
          await restOptions.onSettled?.(...params)
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
  Service,
  Transform extends TransformKey,
  Method extends FunctionName<Service> = FunctionName<Service>,
>(
  reactor: Reactor<Service, Transform>,
  config: MutationConfig<NoInfer<Service>, Method, Transform>
): MutationResult<Service, Method, Transform> {
  return createMutationImpl(
    reactor,
    config as MutationConfig<Service, Method, Transform>
  )
}
