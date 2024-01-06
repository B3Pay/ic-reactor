import type {
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
} from "@ic-reactor/store"
export type * from "@ic-reactor/store"

export type ReActorCallArgs<A, M extends keyof A> = {
  functionName: M & string
  args?: ExtractActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | unknown) => void
  onSuccess?: (data: ExtractActorMethodReturnType<A[M]> | undefined) => void
}

export type ReActorHookState<A, M extends keyof A> = {
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ReActorUseQueryArgs<A, M extends keyof A>
  extends ReActorCallArgs<A, M> {
  disableInitialCall?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export interface ReActorUseUpdateArgs<A, M extends keyof A>
  extends ReActorCallArgs<A, M> {}
