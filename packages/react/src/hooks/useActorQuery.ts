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
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = ReactorReturnOk<A, M, T>,
> extends Omit<
  QueryObserverOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    TSelected,
    ReactorReturnOk<A, M, T>,
    QueryKey
  >,
  "queryKey" | "queryFn"
> {
  reactor: Reactor<A, T>
  functionName: M
  args?: ReactorArgs<A, M, T>
  callConfig?: CallConfig
  queryKey?: QueryKey
}

export type UseActorQueryConfig<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = ReactorReturnOk<A, M, T>,
> = Omit<UseActorQueryParameters<A, M, T, TSelected>, "reactor">

export type UseActorQueryResult<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = ReactorReturnOk<A, M, T>,
> = UseQueryResult<TSelected, ReactorReturnErr<A, M, T>>

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
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = ReactorReturnOk<A, M, T>,
>({
  reactor,
  functionName,
  args,
  callConfig,
  queryKey: defaultQueryKey,
  ...options
}: UseActorQueryParameters<A, M, T, TSelected>): UseActorQueryResult<
  A,
  M,
  T,
  TSelected
> => {
  // Memoize query options to prevent unnecessary re-computations
  const { queryKey, queryFn } = useMemo(
    () =>
      reactor.getQueryOptions<M>({
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
