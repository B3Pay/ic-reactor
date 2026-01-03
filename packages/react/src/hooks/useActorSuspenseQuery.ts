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
  ReactorReturnErr,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"

export interface UseActorSuspenseQueryParameters<
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

export type UseActorSuspenseQueryConfig<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = ReactorReturnOk<A, M, T>,
> = Omit<UseActorSuspenseQueryParameters<A, M, T, TSelected>, "reactor">

export type UseActorSuspenseQueryResult<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TSelected = ReactorReturnOk<A, M, T>,
> = UseSuspenseQueryResult<TSelected, ReactorReturnErr<A, M, T>>

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
}: UseActorSuspenseQueryParameters<
  A,
  M,
  T,
  TSelected
>): UseActorSuspenseQueryResult<A, M, T, TSelected> => {
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

  return useSuspenseQuery(
    {
      // Suspense queries don't support skipToken, so cast the queryFn
      queryFn: queryFn as QueryFunction<ReactorReturnOk<A, M, T>, QueryKey>,
      ...options,
      queryKey,
    },
    reactor.queryClient
  )
}
