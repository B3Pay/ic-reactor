import { useCallback } from "react"
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
  /**
   * Queries to invalidate upon successful mutation.
   *
   * `undefined` entries are skipped, so the common
   * `[maybeQuery?.getQueryKey()]` idiom is safe when the optional query object
   * is absent.
   */
  invalidateQueries?: (QueryKey | undefined)[]
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
        // Skip undefined entries. React Query reads `{ queryKey: undefined }`
        // as "match everything", so a single undefined — which the natural
        // `invalidateQueries: [maybeQuery?.getQueryKey()]` idiom produces
        // whenever the optional query object is absent — would invalidate every
        // query in the client, including an app's unrelated non-canister ones.
        // `createMutation.invalidateAll` already filters the same way.
        await Promise.all(
          invalidateQueries
            .filter((queryKey) => queryKey !== undefined)
            .map((queryKey) =>
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
      ...options,
      mutationFn,
      onSuccess: handleSuccess,
      onError: handleError,
    },
    reactor.queryClient
  )
}
