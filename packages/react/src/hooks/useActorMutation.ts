import { useCallback } from "react"
import {
  useMutation,
  UseMutationOptions,
  UseMutationResult,
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
import { invalidateTargets, useMountQueryClient } from "../utils.js"
import type { InvalidationTarget } from "../types.js"

export interface UseActorMutationParameters<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TOnMutateResult = unknown,
> extends Omit<
  UseMutationOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    ReactorArgs<Service, Method, Transform>,
    TOnMutateResult
  >,
  "mutationFn"
> {
  reactor: Reactor<Service, Transform>
  functionName: Method
  callConfig?: CallConfig
  /**
   * Queries to invalidate upon successful mutation, awaited before
   * `onSuccess` runs.
   *
   * Each entry is a query key, a query object or query factory, or a
   * `{ functionName, args? }` method of `reactor`; see
   * {@link InvalidationTarget}. `undefined` entries are skipped, so
   * `[maybeQuery]` is safe when the optional query object is absent.
   */
  invalidateQueries?: InvalidationTarget<Service, Transform>[]
  /**
   * Callback for canister-level business logic errors.
   * Called when the canister returns a Result { Err: E } variant.
   * Separate from `onError`, which fires for all errors including network failures.
   */
  onCanisterError?: (
    error: CanisterError<
      TransformReturnRegistry<
        ErrResult<ActorMethodReturnType<Service[Method]>>,
        Service
      >[Transform]
    >,
    variables: ReactorArgs<Service, Method, Transform>
  ) => void
}

export type UseActorMutationConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TOnMutateResult = unknown,
> = Omit<
  UseActorMutationParameters<Service, Method, Transform, TOnMutateResult>,
  "reactor"
>

export type UseActorMutationResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TOnMutateResult = unknown,
> = UseMutationResult<
  ReactorReturnOk<Service, Method, Transform>,
  ReactorReturnErr<Service, Method, Transform>,
  ReactorArgs<Service, Method, Transform>,
  TOnMutateResult
>

/**
 * Hook for executing mutation calls on a canister.
 * Use this for component-level mutation flows.
 * For non-React usage, prefer `createMutation(...).execute(args)`.
 *
 * @example
 * const { mutate, isPending } = useReactorMutation({
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
  TOnMutateResult = unknown,
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
  Transform,
  TOnMutateResult
>): UseActorMutationResult<Service, Method, Transform, TOnMutateResult> => {
  useMountQueryClient(reactor.queryClient)

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
            ReactorArgs<Service, Method, Transform>,
            TOnMutateResult
          >["onSuccess"]
        >
      >
    ) => {
      // Undefined entries are skipped: React Query reads
      // `{ queryKey: undefined }` as "match everything", and the natural
      // `[maybeQuery]` idiom produces one whenever the query is absent.
      await invalidateTargets(reactor, invalidateQueries)
      await onSuccess?.(...params)
    },
    [reactor, invalidateQueries, onSuccess]
  )

  const handleError = useCallback(
    async (
      error: ReactorReturnErr<Service, Method, Transform>,
      variables: ReactorArgs<Service, Method, Transform>,
      context: unknown,
      mutation: unknown
    ) => {
      if (isCanisterError(error)) {
        onCanisterError?.(error as any, variables)
      }
      // Awaited like `onSuccess` above. TanStack Query waits for the promise
      // `onError` returns before it runs `onSettled` and settles the mutation,
      // and it can only wait for a promise this wrapper passes back.
      await onError?.(error, variables, context as any, mutation as any)
    },
    [onCanisterError, onError]
  )

  // Not memoized. The deps could only ever list the values destructured above,
  // never the `options` rest bucket, so everything passed straight through —
  // `onMutate`, `onSettled`, `retry`, `meta`, `gcTime` — was frozen at the first
  // render: `useMutation` calls `observer.setOptions` from an effect keyed on
  // the options identity, so a later render's closures never reached it. A
  // component passing only `onSettled` would report the recipient selected at
  // mount rather than at submit.
  //
  // `createMutation`'s own hook builds its options inline for the same reason.
  // A fresh object per render costs nothing here: `setOptions` diffs the values
  // rather than the reference.
  return useMutation(
    {
      // Keyed like `createMutation`'s hook and `useActorMethod`'s mutations,
      // so `useIsMutating({ mutationKey })`, `useMutationState` and defaults
      // registered with `setMutationDefaults` can find this one too. An
      // explicit `mutationKey` in the options still wins.
      mutationKey: reactor.getQueryOptions({ functionName, callConfig })
        .queryKey,
      ...options,
      mutationFn,
      onSuccess: handleSuccess,
      onError: handleError,
    },
    reactor.queryClient
  )
}
