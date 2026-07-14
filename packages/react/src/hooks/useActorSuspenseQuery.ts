import { useMemo } from "react"
import {
  QueryKey,
  useSuspenseQuery,
  QueryObserverOptions,
  UseSuspenseQueryResult,
  QueryFunction,
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

export interface UseActorSuspenseQueryParameters<
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
  args?: ReactorArgs<Service, Method, Transform>
  callConfig?: CallConfig
  queryKey?: QueryKey
}

export type UseActorSuspenseQueryConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
> = Omit<
  UseActorSuspenseQueryParameters<Service, Method, Transform, Selected>,
  "reactor"
>

export type UseActorSuspenseQueryResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
> = UseSuspenseQueryResult<
  Selected,
  ReactorReturnErr<Service, Method, Transform>
>

/**
 * Hook for executing suspense-enabled query calls on a canister.
 *
 * @example
 * const { data } = useActorSuspenseQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: ["user-123"],
 * })
 *
 * // With select transformation
 * const { data } = useActorSuspenseQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: ["user-123"],
 *   select: (user) => user.name,
 * })
 */
export const useActorSuspenseQuery = <
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
}: UseActorSuspenseQueryParameters<
  Service,
  Method,
  Transform,
  Selected
>): UseActorSuspenseQueryResult<Service, Method, Transform, Selected> => {
  // Memoize query options to prevent unnecessary re-computations
  const { queryKey, queryFn } = useMemo(
    () =>
      reactor.getQueryOptions<Method>({
        callConfig,
        functionName,
        args,
        queryKey: defaultQueryKey,
      }),
    [reactor, callConfig, functionName, args, defaultQueryKey]
  )

  return useSuspenseQuery(
    {
      // Suspense queries don't support skipToken, so cast the queryFn
      queryFn: queryFn as QueryFunction<
        ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
        QueryKey
      >,
      ...options,
      queryKey,
    },
    reactor.queryClient
  )
}
