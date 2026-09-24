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

import {
  useMutation,
  type MutationFunctionContext,
  type UseMutationOptions,
} from "@tanstack/react-query"
import type {
  Reactor,
  FunctionName,
  ReactorArgs,
  TransformKey,
  ReactorReturnOk,
  ReactorReturnErr,
} from "@ic-reactor/core"
import { isCanisterError } from "@ic-reactor/core"
import type {
  MutationConfig,
  MutationResult,
  MutationHookOptions,
  NoInfer,
} from "./types.js"
import { useMountQueryClient } from "./utils.js"

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
  TOnMutateResult = unknown,
>(
  reactor: Reactor<Service, Transform>,
  config: MutationConfig<
    Service,
    Method,
    Transform,
    TOnMutateResult | undefined
  >
): MutationResult<Service, Method, Transform> => {
  type TData = ReactorReturnOk<Service, Method, Transform>
  type TError = ReactorReturnErr<Service, Method, Transform>
  type TVariables = ReactorArgs<Service, Method, Transform>

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
  const callFn = (args: TVariables): Promise<TData> =>
    reactor.callMethod({ functionName, args, callConfig })

  /**
   * The factory's own `onMutate` result for each call.
   *
   * TanStack Query stores one `onMutate` result per mutation and hands it to
   * every callback. That slot holds the hook's result, which the mutation also
   * exposes as `context`, so this map holds the factory's. Each key is the
   * context object TanStack Query creates for a call and passes to every
   * callback of that call.
   */
  const factoryOnMutateResults = new WeakMap<
    MutationFunctionContext,
    TOnMutateResult | undefined
  >()

  /**
   * The `onMutate` result a factory callback receives. A factory without its
   * own `onMutate` gets the hook's, as it always has.
   */
  const factoryOnMutateResult = (
    onMutateResult: unknown,
    context: MutationFunctionContext | undefined
  ) =>
    (factoryOnMutate && context
      ? factoryOnMutateResults.get(context)
      : onMutateResult) as TOnMutateResult | undefined

  /**
   * The options a mutation of this factory runs with, on both call paths: the
   * factory's config, the hook's options on top when there is a hook, and the
   * callbacks of both levels chained, factory first. `useMutation()` hands
   * them to TanStack Query's `useMutation`, and `execute()` builds a mutation
   * from them in the QueryClient's MutationCache.
   */
  const mutationOptions = <THookOnMutateResult = unknown>(
    options?: MutationHookOptions<
      Service,
      Method,
      Transform,
      THookOnMutateResult
    >
  ): UseMutationOptions<TData, TError, TVariables, THookOnMutateResult> => {
    const {
      invalidateQueries: hookInvalidateQueries,
      onCanisterError: hookOnCanisterError,
      ...restOptions
    } = options ?? {}

    return {
      mutationKey: reactor.getQueryOptions({ functionName }).queryKey,
      ...factoryOptions,
      ...restOptions,
      // Use callFn (not execute) to avoid double-invalidation:
      // factoryInvalidateQueries are handled in onSuccess below.
      mutationFn: callFn,
      onSuccess: async (data, variables, onMutateResult, context) => {
        // 1. Factory-level invalidation
        if (factoryInvalidateQueries) {
          await invalidateAll(reactor.queryClient, factoryInvalidateQueries)
        }
        // 2. Hook-level invalidation
        if (hookInvalidateQueries) {
          await invalidateAll(reactor.queryClient, hookInvalidateQueries)
        }
        // 3. Factory onSuccess
        await factoryOnSuccess?.(
          data,
          variables,
          factoryOnMutateResult(onMutateResult, context),
          context
        )
        // 4. Hook onSuccess
        await restOptions.onSuccess?.(data, variables, onMutateResult, context)
      },
      onError: async (error, variables, onMutateResult, context) => {
        if (isCanisterError(error)) {
          factoryOnCanisterError?.(error, variables)
          hookOnCanisterError?.(error, variables)
        }
        // Awaited in order, like `onSuccess`. TanStack Query holds
        // `onSettled` and the settled state until this promise resolves, so
        // an async `onError` must be part of it.
        await factoryOnError?.(
          error,
          variables,
          factoryOnMutateResult(onMutateResult, context),
          context
        )
        await restOptions.onError?.(error, variables, onMutateResult, context)
      },
      // `onMutate` and `onSettled` are composed like `onSuccess`/`onError`
      // above. They used to arrive through the `...restOptions` spread, so a
      // hook-level one silently replaced the factory's — factory teardown,
      // telemetry or logging simply vanished the moment any call site passed
      // its own, with no warning and no type error. Chaining is what a
      // reader who has seen `onSuccess` chain already expects.
      onMutate: async (variables, context) => {
        if (factoryOnMutate) {
          const result = await factoryOnMutate(variables, context)
          if (context) factoryOnMutateResults.set(context, result)
        }
        // Without a hook-level `onMutate` this is `undefined`, and
        // THookOnMutateResult is then `unknown`.
        return (await restOptions.onMutate?.(
          variables,
          context
        )) as THookOnMutateResult
      },
      onSettled: async (data, error, variables, onMutateResult, context) => {
        await factoryOnSettled?.(
          data,
          error,
          variables,
          factoryOnMutateResult(onMutateResult, context),
          context
        )
        await restOptions.onSettled?.(
          data,
          error,
          variables,
          onMutateResult,
          context
        )
      },
    }
  }

  /**
   * Imperative execution for non-React usage.
   *
   * Builds the mutation in the QueryClient's MutationCache and runs it, as
   * TanStack Query's `useMutation` does, with the options the hook path uses
   * minus the hook's own. It used to call the canister and the factory's
   * callbacks itself, so the MutationCache never saw it: its global
   * `onError`, `onSuccess` and `onSettled` did not run, `useIsMutating` did
   * not count it, and neither the factory's `retry` or `networkMode` nor the
   * same options in the QueryClient's mutation defaults applied to the call.
   * The factory's `onMutate` and `onSettled` did not run either.
   *
   * Now the factory's chain runs as it does through `useMutation()`:
   * `onMutate`, then the factory's invalidation and `onSuccess`, or
   * `onCanisterError` and `onError` on failure, then `onSettled`. Each factory
   * callback gets the result of the factory's `onMutate` for this call. Only
   * hook-level callbacks are absent, because there is no hook here to supply
   * them.
   *
   * The QueryClient's mutation defaults apply as well, so a `mutations.retry`
   * there re-sends a failed call here too. Each retry of an update method is
   * a new call the canister runs; set `retry` on the factory (`false`, or
   * `reactorUpdateRetry` to retry only a SysTransient rejection) to decide it
   * per method.
   *
   * It resolves with the method's result. On failure it rejects with the
   * call's error once the callbacks have run, so `await execute(...)` still
   * rejects for the caller.
   *
   * Use this in route loaders, scripts, or server-side code.
   */
  const execute = async (args: TVariables): Promise<TData> => {
    const { queryClient } = reactor
    const options = mutationOptions()
    const { onError } = options
    // What the factory's `onError` or `onCanisterError` throws, if either
    // does. execute() has always rejected with it, and a TanStack Query
    // mutation at the 5.90.2 peer floor does too. Later releases reject with
    // the call's error and report the thrown one as an unhandled rejection,
    // which ends a Node script, so it is caught here and rethrown below.
    let thrownByOnError: { error: unknown } | undefined
    const mutation = queryClient
      .getMutationCache()
      .build<TData, TError, TVariables, unknown>(queryClient, {
        ...options,
        onError: async (error, variables, onMutateResult, context) => {
          try {
            await onError?.(error, variables, onMutateResult, context)
          } catch (thrown) {
            thrownByOnError = { error: thrown }
          }
        },
      })
    try {
      return await mutation.execute(args)
    } catch (error) {
      throw thrownByOnError ? thrownByOnError.error : error
    }
  }

  // Hook implementation
  const useMutationHook = <THookOnMutateResult = unknown>(
    options?: MutationHookOptions<
      Service,
      Method,
      Transform,
      THookOnMutateResult
    >
  ) => {
    useMountQueryClient(reactor.queryClient)
    return useMutation(mutationOptions(options), reactor.queryClient)
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
  TOnMutateResult = unknown,
>(
  reactor: Reactor<Service, Transform>,
  // A factory `onError` or `onSettled` gets no `onMutate` result when
  // `onMutate` throws, so the result can also be `undefined`. `onSuccess`
  // shares the type argument. It kept the `undefined` from when `execute()`
  // ran no `onMutate`, although it now always gets a result.
  config: MutationConfig<
    NoInfer<Service>,
    Method,
    Transform,
    TOnMutateResult | undefined
  >
): MutationResult<Service, Method, Transform> {
  return createMutationImpl(
    reactor,
    config as MutationConfig<
      Service,
      Method,
      Transform,
      TOnMutateResult | undefined
    >
  )
}
