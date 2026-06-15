import { useMemo } from "react"
import {
  QueryKey,
  useQuery,
  QueryObserverOptions,
  UseQueryResult,
} from "@tanstack/react-query"
import {
  FunctionName,
  Reactor,
  TransformKey,
  ReactorArgs,
  ReactorReturnOk,
  ReactorReturnErr,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"

export interface UseActorQueryParameters<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorReturnOk<Service, Method, Transform>,
> extends Omit<
  QueryObserverOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    Selected,
    ReactorReturnOk<Service, Method, Transform>,
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

export type UseActorQueryConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorReturnOk<Service, Method, Transform>,
> = Omit<
  UseActorQueryParameters<Service, Method, Transform, Selected>,
  "reactor"
>

export type UseActorQueryResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorReturnOk<Service, Method, Transform>,
> = UseQueryResult<Selected, ReactorReturnErr<Service, Method, Transform>>

/**
 * Hook for executing query calls on a canister.
 *
 * @example
 * const { data, isLoading } = useActorQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: ["user-123"],
 * })
 *
 * // With select transformation
 * const { data } = useActorQuery({
 *   reactor,
 *   functionName: "getUser",
 *   args: ["user-123"],
 *   select: (user) => user.name,
 * })
 */
export const useActorQuery = <
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  Selected = ReactorReturnOk<Service, Method, Transform>,
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

  return useQuery(
    {
      queryFn,
      ...options,
      queryKey,
    },
    reactor.queryClient
  )
}
