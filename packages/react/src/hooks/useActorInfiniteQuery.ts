import { useMemo, useCallback } from "react"
import {
  QueryKey,
  useInfiniteQuery,
  UseInfiniteQueryResult,
  UseInfiniteQueryOptions,
  InfiniteData,
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

/**
 * Parameters for useActorInfiniteQuery hook.
 * Extends react-query's UseInfiniteQueryOptions with custom reactor params.
 */
export interface UseActorInfiniteQueryParameters<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
  TSelected = InfiniteData<ReactorReturnOk<A, M, T>, TPageParam>,
> extends Omit<
  UseInfiniteQueryOptions<
    ReactorReturnOk<A, M, T>,
    ReactorReturnErr<A, M, T>,
    TSelected,
    QueryKey,
    TPageParam
  >,
  "queryKey" | "queryFn" | "getNextPageParam" | "initialPageParam"
> {
  /** The reactor instance to use for method calls */
  reactor: Reactor<A, T>
  /** The method name to call on the canister */
  functionName: M
  /** Function to get args from page parameter */
  getArgs: (pageParam: TPageParam) => ReactorArgs<A, M, T>
  /** Agent call configuration (effectiveCanisterId, etc.) */
  callConfig?: CallConfig
  /** Custom query key (auto-generated if not provided) */
  queryKey?: QueryKey
  /** Initial page parameter */
  initialPageParam: TPageParam
  /** Function to determine next page parameter */
  getNextPageParam: (
    lastPage: ReactorReturnOk<A, M, T>,
    allPages: ReactorReturnOk<A, M, T>[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
}

export type UseActorInfiniteQueryConfig<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
> = Omit<UseActorInfiniteQueryParameters<A, M, T, TPageParam>, "reactor">

export type UseActorInfiniteQueryResult<
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
> = UseInfiniteQueryResult<
  InfiniteData<ReactorReturnOk<A, M, T>, TPageParam>,
  ReactorReturnErr<A, M, T>
>

/**
 * Hook for executing infinite/paginated query calls on a canister.
 *
 * @example
 * const { data, fetchNextPage, hasNextPage } = useActorInfiniteQuery({
 *   reactor,
 *   functionName: "getItems",
 *   getArgs: (pageParam) => [{ offset: pageParam, limit: 10 }],
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextOffset,
 * })
 */
export const useActorInfiniteQuery = <
  A,
  M extends FunctionName<A>,
  T extends TransformKey = "candid",
  TPageParam = unknown,
>({
  reactor,
  functionName,
  getArgs,
  callConfig,
  queryKey,
  ...options
}: UseActorInfiniteQueryParameters<
  A,
  M,
  T,
  TPageParam
>): UseActorInfiniteQueryResult<A, M, T, TPageParam> => {
  // Memoize queryKey to prevent unnecessary re-calculations
  const baseQueryKey = useMemo(
    () => queryKey ?? reactor.generateQueryKey({ functionName }),
    [queryKey, reactor, functionName]
  )

  // Memoize queryFn to prevent recreation on every render
  const queryFn = useCallback(
    async ({ pageParam }: { pageParam: TPageParam }) => {
      const args = getArgs(pageParam)
      return reactor.callMethod({
        functionName,
        args,
        callConfig,
      })
    },
    [reactor, functionName, getArgs, callConfig]
  )

  return useInfiniteQuery(
    {
      queryKey: baseQueryKey,
      queryFn,
      ...options,
    } as any,
    reactor.queryClient
  ) as UseActorInfiniteQueryResult<A, M, T, TPageParam>
}
