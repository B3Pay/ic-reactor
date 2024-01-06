import type {
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
} from "@ic-reactor/store"
export type * from "@ic-reactor/store"

export type ActorCallArgs<A, M extends keyof A> = {
  functionName: M & string
  args?: ExtractActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | unknown) => void
  onSuccess?: (data: ExtractActorMethodReturnType<A[M]> | undefined) => void
}

export type ActorHookState<A, M extends keyof A> = {
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ActorUseQueryArgs<A, M extends keyof A>
  extends ActorCallArgs<A, M> {
  disableInitialCall?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export interface ActorUseUpdateArgs<A, M extends keyof A>
  extends ActorCallArgs<A, M> {}
