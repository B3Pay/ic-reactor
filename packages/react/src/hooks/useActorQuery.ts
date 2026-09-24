import { useMemo } from "react"
import {
  QueryKey,
  useQuery,
  skipToken,
  QueryObserverOptions,
  UseQueryResult,
  type SkipToken,
} from "@tanstack/react-query"
import {
  FunctionName,
  Reactor,
  TransformKey,
  ReactorArgs,
  ReactorReturnOk,
  ReactorQueryData,
  ReactorReturnErr,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"
import { retryOption, useMountQueryClient } from "../utils.js"

export interface UseActorQueryParameters<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
> extends Omit<
  QueryObserverOptions<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    ReactorReturnErr<Service, Method, Transform>,
    Selected,
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    QueryKey
  >,
  "queryKey" | "queryFn"
> {
  reactor: Reactor<Service, Transform>
  functionName: Method
  /**
   * The method's arguments, or TanStack Query's `skipToken` while they are
   * not known: the query then waits without fetching, keyed by its method
   * alone, the prefix every key its arguments will give it extends.
   */
  args?: ReactorArgs<Service, Method, Transform> | SkipToken
  callConfig?: CallConfig
  queryKey?: QueryKey
}

export type UseActorQueryConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
> = Omit<
  UseActorQueryParameters<Service, Method, Transform, Selected>,
  "reactor"
>

export type UseActorQueryResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
> = UseQueryResult<Selected, ReactorReturnErr<Service, Method, Transform>>

/**
 * Hook for executing query calls on a canister.
 *
 * @example
 * const { data, isLoading } = useReactorQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: ["user-123"],
 * })
 *
 * // With select transformation
 * const { data } = useReactorQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: ["user-123"],
 *   select: (user) => user.name,
 * })
 *
 * // Wait for the args: no fetch until userId is known
 * const { data } = useReactorQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: userId ? [userId] : skipToken,
 * })
 */
export const useActorQuery = <
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
>({
  reactor,
  functionName,
  args,
  callConfig,
  queryKey: defaultQueryKey,
  ...options
}: UseActorQueryParameters<
  Service,
  Method,
  Transform,
  Selected
>): UseActorQueryResult<Service, Method, Transform, Selected> => {
  useMountQueryClient(reactor.queryClient)

  // Memoize query options to prevent unnecessary re-computations
  // For an update method, the options also carry its default `retry`; see
  // `Reactor.getQueryRetry`.
  const { queryKey, queryFn, retry } = useMemo(
    () =>
      args === skipToken
        ? // Waiting for its args: keyed by the method alone, which every key
          // the args will give extends, with nothing to run until then.
          {
            queryKey: reactor.generateQueryKey({ functionName }, callConfig),
            // Kept as the unique symbol, which an object literal widens.
            queryFn: skipToken as SkipToken,
            retry: undefined,
          }
        : reactor.getQueryOptions<Method>({
            callConfig,
            functionName,
            args,
            queryKey: defaultQueryKey,
          }),
    // `canisterId` is mutable reactor state that `setCanisterId` can change,
    // while `reactor` itself stays the same object — so it has to be a
    // dependency in its own right or the key stays pinned to the old canister.
    [
      reactor,
      reactor.canisterId?.toString(),
      callConfig,
      functionName,
      args,
      defaultQueryKey,
    ]
  )

  return useQuery(
    {
      queryFn,
      ...options,
      queryKey,
      ...retryOption(options.retry, retry),
    },
    reactor.queryClient
  )
}
