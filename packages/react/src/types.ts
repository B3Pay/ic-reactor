import {
  ExtractReActorMethodArgs,
  ExtractReActorMethodReturnType,
} from "@ic-reactor/store"

export type ReActorCallArgs<A, M extends keyof A> = {
  functionName: M & string
  args?: ExtractReActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | unknown) => void
  onSuccess?: (data: ExtractReActorMethodReturnType<A[M]> | undefined) => void
}

export type ReActorHookState<A, M extends keyof A> = {
  data: ExtractReActorMethodReturnType<A[M]> | undefined
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
