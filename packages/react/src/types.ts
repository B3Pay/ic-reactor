import type {
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ServiceMethodType,
} from "@ic-reactor/store"
export type * from "@ic-reactor/store"
export type * from "@ic-reactor/store/dist/actor/types"

export type ActorCallArgs<A, M extends keyof A> = {
  functionName: M & string
  args?: ExtractActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ExtractActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type ActorHookState<A, M extends keyof A> = {
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ActorUseQueryArgs<A, M extends keyof A>
  extends ActorCallArgs<A, M> {
  callOnMount?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export interface ActorUseUpdateArgs<A, M extends keyof A>
  extends ActorCallArgs<A, M> {}

export type ActorUseMethodArg<
  A,
  T extends ServiceMethodType
> = T extends "query"
  ? ActorUseQueryArgs<A, keyof A>
  : ActorUseUpdateArgs<A, keyof A>
