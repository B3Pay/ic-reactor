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
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    ReactorReturnOk<Service, Method, Transform>,
    TPageParam
  >,
> extends Omit<
  UseInfiniteQueryOptions<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>,
    Selected,
    QueryKey,
    TPageParam
  >,
  "queryKey" | "queryFn" | "getNextPageParam" | "initialPageParam"
> {
  /** The reactor instance to use for method calls */
  reactor: Reactor<Service, Transform>
  /** The method name to call on the canister */
  functionName: Method
  /** Function to get args from page parameter */
  getArgs: (pageParam: TPageParam) => ReactorArgs<Service, Method, Transform>
  /** Agent call configuration (effectiveCanisterId, etc.) */
  callConfig?: CallConfig
  /** Custom query key (auto-generated if not provided) */
  queryKey?: QueryKey
  /** Initial page parameter */
  initialPageParam: TPageParam
  /** Function to determine next page parameter */
  getNextPageParam: (
    lastPage: ReactorReturnOk<Service, Method, Transform>,
    allPages: ReactorReturnOk<Service, Method, Transform>[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
}

export type UseActorInfiniteQueryConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
> = Omit<
  UseActorInfiniteQueryParameters<Service, Method, Transform, TPageParam>,
  "reactor"
>

export type UseActorInfiniteQueryResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
> = UseInfiniteQueryResult<
  InfiniteData<ReactorReturnOk<Service, Method, Transform>, TPageParam>,
  ReactorReturnErr<Service, Method, Transform>
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
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
>({
  reactor,
  functionName,
  getArgs,
  callConfig,
  queryKey,
  ...options
}: UseActorInfiniteQueryParameters<
  Service,
  Method,
  Transform,
  TPageParam
>): UseActorInfiniteQueryResult<Service, Method, Transform, TPageParam> => {
  // Always pass queryKey through generateQueryKey so it is merged with the
  // reactor/function identity. Using the custom key verbatim would cause cache
  // collisions if two different actors or methods share the same key string.
  const baseQueryKey = useMemo(
    () => reactor.generateQueryKey({ functionName, queryKey }, callConfig),
    [queryKey, reactor, functionName, callConfig]
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
  ) as UseActorInfiniteQueryResult<Service, Method, Transform, TPageParam>
}
