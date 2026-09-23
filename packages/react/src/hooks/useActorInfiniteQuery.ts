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
  ReactorQueryData,
  ReactorReturnErr,
} from "@ic-reactor/core"
import { CallConfig } from "@icp-sdk/core/agent"
import {
  callConfigForKey,
  mergeFactoryQueryKey,
  normalizeQueryData,
  useMountQueryClient,
} from "../utils.js"

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
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    TPageParam
  >,
> extends Omit<
  UseInfiniteQueryOptions<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
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
  /**
   * Narrows what the cache key derives from the call arguments.
   *
   * By default the key is scoped by `getArgs(initialPageParam)`, so two
   * infinite queries on the same method with different arguments stay in
   * separate cache entries. Supply this when those args embed the cursor and
   * only part of them identifies the query — return the stable, serializable
   * portion (typically everything except the pagination field). It is required
   * when `initialPageParam` changes between renders, as `Date.now()` does:
   * without it every render keys a new query.
   */
  getKeyArgs?: (args: ReactorArgs<Service, Method, Transform>) => unknown
  /** Agent call configuration (effectiveCanisterId, etc.) */
  callConfig?: CallConfig
  /** Custom query key (auto-generated if not provided) */
  queryKey?: QueryKey
  /** Initial page parameter */
  initialPageParam: TPageParam
  /** Function to determine next page parameter */
  getNextPageParam: (
    lastPage: ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    allPages: ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[]
  ) => TPageParam | undefined | null
}

export type UseActorInfiniteQueryConfig<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    TPageParam
  >,
> = Omit<
  UseActorInfiniteQueryParameters<
    Service,
    Method,
    Transform,
    TPageParam,
    Selected
  >,
  "reactor"
>

export type UseActorInfiniteQueryResult<
  Service,
  Method extends FunctionName<Service>,
  Transform extends TransformKey = "candid",
  TPageParam = unknown,
  Selected = InfiniteData<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    TPageParam
  >,
> = UseInfiniteQueryResult<
  Selected,
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
  Selected = InfiniteData<
    ReactorQueryData<ReactorReturnOk<Service, Method, Transform>>,
    TPageParam
  >,
>({
  reactor,
  functionName,
  getArgs,
  getKeyArgs,
  callConfig,
  queryKey,
  ...options
}: UseActorInfiniteQueryParameters<
  Service,
  Method,
  Transform,
  TPageParam,
  Selected
>): UseActorInfiniteQueryResult<
  Service,
  Method,
  Transform,
  TPageParam,
  Selected
> => {
  useMountQueryClient(reactor.queryClient)

  // Always pass queryKey through generateQueryKey so it is merged with the
  // reactor/function identity. Using the custom key verbatim would cause cache
  // collisions if two different actors or methods share the same key string.
  const baseQueryKey = useMemo(() => {
    // Fold the call arguments into the key. They live in the `getArgs`
    // closure rather than in the config, so without this two hooks on the
    // same method with different arguments share one cache entry and serve
    // each other's pages. `getKeyArgs` narrows them exactly as it does for the
    // factories, which the bound hook's config type always accepted: it used
    // to be ignored here, so the cursor stayed in the key, and an
    // `initialPageParam` that changes every render (`Date.now()`) keyed a new
    // query on every render — an endless loop of first-page fetches.
    const initialArgs = getArgs(options.initialPageParam)
    const keyArgs = getKeyArgs?.(initialArgs) ?? initialArgs

    return reactor.generateQueryKey(
      {
        functionName,
        queryKey: mergeFactoryQueryKey(queryKey, undefined, keyArgs),
      },
      callConfig
    )
  }, [
    queryKey,
    reactor,
    // `canisterId` is mutable reactor state that `setCanisterId` can change,
    // while `reactor` itself stays the same object — so it has to be a
    // dependency in its own right or the key stays pinned to the old canister
    // while the queryFn already calls the new one.
    reactor.canisterId?.toString(),
    functionName,
    callConfig,
    getArgs,
    getKeyArgs,
    options.initialPageParam,
  ])

  // Memoize queryFn to prevent recreation on every render
  const queryFn = useCallback(
    async ({
      pageParam,
      queryKey: fetchedKey,
    }: {
      pageParam: TPageParam
      queryKey: QueryKey
    }) => {
      const args = getArgs(pageParam)
      const result = await reactor.callMethod({
        functionName,
        args,
        callConfig: callConfigForKey(fetchedKey, callConfig),
      })
      return normalizeQueryData<ReactorReturnOk<Service, Method, Transform>>(
        result as ReactorReturnOk<Service, Method, Transform>
      )
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
  ) as UseActorInfiniteQueryResult<
    Service,
    Method,
    Transform,
    TPageParam,
    Selected
  >
}
