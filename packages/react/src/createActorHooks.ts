/**
 * Actor Hooks Factory - Creates a full set of React hooks for a reactor instance.
 *
 * This is the primary entry point for using the library in React applications.
 * It generates type-safe hooks for:
 * - Queries (useActorQuery)
 * - Suspense Queries (useActorSuspenseQuery)
 * - Infinite Queries (useActorInfiniteQuery)
 * - Suspense Infinite Queries (useActorSuspenseInfiniteQuery)
 * - Mutations (useActorMutation)
 *
 * @example
 * const { useActorQuery, useActorMutation } = createActorHooks(reactor)
 *
 * // In component
 * const { data } = useActorQuery({ functionName: 'get_user' })
 * const { mutate } = useActorMutation({ functionName: 'update_user' })
 */
import {
  Reactor,
  DisplayReactor,
  ReactorReturnErr,
  ReactorReturnOk,
  BaseActor,
  FunctionName,
  TransformKey,
} from "@ic-reactor/core"
import {
  UseQueryResult,
  UseSuspenseQueryResult,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryResult,
  UseMutationResult,
  InfiniteData,
} from "@tanstack/react-query"
import { useActorQuery } from "./hooks/useActorQuery"
import { useActorSuspenseQuery } from "./hooks/useActorSuspenseQuery"
import { useActorInfiniteQuery } from "./hooks/useActorInfiniteQuery"
import { useActorSuspenseInfiniteQuery } from "./hooks/useActorSuspenseInfiniteQuery"
import { useActorMutation } from "./hooks/useActorMutation"
import {
  useActorMethod,
  UseActorMethodParameters,
} from "./hooks/useActorMethod"
import { InfiniteQueryConfig } from "./createInfiniteQuery"
import { SuspenseInfiniteQueryConfig } from "./createSuspenseInfiniteQuery"
import { QueryConfig, SuspenseQueryConfig, MutationConfig } from "./types"

export type ActorHooks<A, T extends TransformKey> = {
  useActorQuery: {
    <M extends FunctionName<A>>(
      config: QueryConfig<A, M, T, ReactorReturnOk<A, M, T>>
    ): UseQueryResult<ReactorReturnOk<A, M, T>, ReactorReturnErr<A, M, T>>
    <M extends FunctionName<A>, TData>(
      config: QueryConfig<A, M, T, TData>
    ): UseQueryResult<TData, ReactorReturnErr<A, M, T>>
  }

  useActorSuspenseQuery: {
    <M extends FunctionName<A>>(
      config: SuspenseQueryConfig<A, M, T, ReactorReturnOk<A, M, T>>
    ): UseSuspenseQueryResult<
      ReactorReturnOk<A, M, T>,
      ReactorReturnErr<A, M, T>
    >
    <M extends FunctionName<A>, TData>(
      config: SuspenseQueryConfig<A, M, T, TData>
    ): UseSuspenseQueryResult<TData, ReactorReturnErr<A, M, T>>
  }

  useActorInfiniteQuery: <M extends FunctionName<A>, TPageParam = unknown>(
    config: InfiniteQueryConfig<A, M, T, TPageParam>
  ) => UseInfiniteQueryResult<
    InfiniteData<ReactorReturnOk<A, M, T>, TPageParam>,
    ReactorReturnErr<A, M, T>
  >

  useActorSuspenseInfiniteQuery: <
    M extends FunctionName<A>,
    TPageParam = unknown,
  >(
    config: SuspenseInfiniteQueryConfig<A, M, T, TPageParam>
  ) => UseSuspenseInfiniteQueryResult<
    InfiniteData<ReactorReturnOk<A, M, T>, TPageParam>,
    ReactorReturnErr<A, M, T>
  >

  useActorMutation: <M extends FunctionName<A>>(
    config: MutationConfig<A, M, T>
  ) => UseMutationResult<ReactorReturnOk<A, M, T>, ReactorReturnErr<A, M, T>>

  useActorMethod: <M extends FunctionName<A>>(
    config: Omit<UseActorMethodParameters<A, M, T>, "reactor">
  ) => ReturnType<typeof useActorMethod<A, M, T>>
}

export function createActorHooks<A>(
  reactor: DisplayReactor<A>
): ActorHooks<A, "display">

export function createActorHooks<
  A = BaseActor,
  T extends TransformKey = "candid",
>(reactor: Reactor<A, T>): ActorHooks<A, T>

export function createActorHooks<A, T extends TransformKey>(
  reactor: Reactor<A, T>
): ActorHooks<A, T> {
  return {
    useActorQuery: ((config: any) =>
      useActorQuery({ ...config, reactor })) as ActorHooks<
      A,
      T
    >["useActorQuery"],

    useActorSuspenseQuery: ((config: any) =>
      useActorSuspenseQuery({ ...config, reactor })) as ActorHooks<
      A,
      T
    >["useActorSuspenseQuery"],

    useActorInfiniteQuery: ((config: any) =>
      useActorInfiniteQuery({ ...config, reactor })) as ActorHooks<
      A,
      T
    >["useActorInfiniteQuery"],

    useActorSuspenseInfiniteQuery: ((config: any) =>
      useActorSuspenseInfiniteQuery({ ...config, reactor })) as ActorHooks<
      A,
      T
    >["useActorSuspenseInfiniteQuery"],

    useActorMutation: ((config: any) =>
      useActorMutation({ ...config, reactor })) as ActorHooks<
      A,
      T
    >["useActorMutation"],

    useActorMethod: (config) =>
      useActorMethod({ ...config, reactor } as UseActorMethodParameters<
        A,
        any,
        T
      >),
  }
}
