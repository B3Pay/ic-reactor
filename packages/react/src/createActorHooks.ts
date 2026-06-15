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

export type ActorHooks<Service, Transform extends TransformKey> = {
  useActorQuery: {
    <Method extends FunctionName<Service>>(
      config: QueryConfig<
        Service,
        Method,
        Transform,
        ReactorReturnOk<Service, Method, Transform>
      >
    ): UseQueryResult<
      ReactorReturnOk<Service, Method, Transform>,
      ReactorReturnErr<Service, Method, Transform>
    >
    <Method extends FunctionName<Service>, TData>(
      config: QueryConfig<Service, Method, Transform, TData>
    ): UseQueryResult<TData, ReactorReturnErr<Service, Method, Transform>>
  }

  useActorSuspenseQuery: {
    <Method extends FunctionName<Service>>(
      config: SuspenseQueryConfig<
        Service,
        Method,
        Transform,
        ReactorReturnOk<Service, Method, Transform>
      >
    ): UseSuspenseQueryResult<
      ReactorReturnOk<Service, Method, Transform>,
      ReactorReturnErr<Service, Method, Transform>
    >
    <Method extends FunctionName<Service>, TData>(
      config: SuspenseQueryConfig<Service, Method, Transform, TData>
    ): UseSuspenseQueryResult<
      TData,
      ReactorReturnErr<Service, Method, Transform>
    >
  }

  useActorInfiniteQuery: <
    Method extends FunctionName<Service>,
    TPageParam = unknown,
  >(
    config: InfiniteQueryConfig<Service, Method, Transform, TPageParam>
  ) => UseInfiniteQueryResult<
    InfiniteData<ReactorReturnOk<Service, Method, Transform>, TPageParam>,
    ReactorReturnErr<Service, Method, Transform>
  >

  useActorSuspenseInfiniteQuery: <
    Method extends FunctionName<Service>,
    TPageParam = unknown,
  >(
    config: SuspenseInfiniteQueryConfig<Service, Method, Transform, TPageParam>
  ) => UseSuspenseInfiniteQueryResult<
    InfiniteData<ReactorReturnOk<Service, Method, Transform>, TPageParam>,
    ReactorReturnErr<Service, Method, Transform>
  >

  useActorMutation: <Method extends FunctionName<Service>>(
    config: MutationConfig<Service, Method, Transform>
  ) => UseMutationResult<
    ReactorReturnOk<Service, Method, Transform>,
    ReactorReturnErr<Service, Method, Transform>
  >

  useActorMethod: <Method extends FunctionName<Service>>(
    config: Omit<
      UseActorMethodParameters<Service, Method, Transform>,
      "reactor"
    >
  ) => ReturnType<typeof useActorMethod<Service, Method, Transform>>
}

export function createActorHooks<Service>(
  reactor: DisplayReactor<Service>
): ActorHooks<Service, "display">

export function createActorHooks<
  Service = BaseActor,
  Transform extends TransformKey = "candid",
>(reactor: Reactor<Service, Transform>): ActorHooks<Service, Transform>

export function createActorHooks<Service, Transform extends TransformKey>(
  reactor: Reactor<Service, Transform>
): ActorHooks<Service, Transform> {
  return {
    useActorQuery: ((config: any) =>
      useActorQuery({ ...config, reactor })) as ActorHooks<
      Service,
      Transform
    >["useActorQuery"],

    useActorSuspenseQuery: ((config: any) =>
      useActorSuspenseQuery({ ...config, reactor })) as ActorHooks<
      Service,
      Transform
    >["useActorSuspenseQuery"],

    useActorInfiniteQuery: ((config: any) =>
      useActorInfiniteQuery({ ...config, reactor })) as ActorHooks<
      Service,
      Transform
    >["useActorInfiniteQuery"],

    useActorSuspenseInfiniteQuery: ((config: any) =>
      useActorSuspenseInfiniteQuery({ ...config, reactor })) as ActorHooks<
      Service,
      Transform
    >["useActorSuspenseInfiniteQuery"],

    useActorMutation: ((config: any) =>
      useActorMutation({ ...config, reactor })) as ActorHooks<
      Service,
      Transform
    >["useActorMutation"],

    useActorMethod: (config) =>
      useActorMethod({ ...config, reactor } as UseActorMethodParameters<
        Service,
        any,
        Transform
      >),
  }
}
