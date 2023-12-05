import {
  ActorMethod,
  ActorSubclass,
  ExtractReActorMethodArgs,
  ExtractReActorMethodReturnType,
  ReActorMethodState,
} from "@ic-reactor/store"

export type ReActorGetStateFunction<A, M extends keyof A> = (
  key?: keyof ReActorMethodState<A, M>["states"][string]
) =>
  | ReActorMethodState<A, M>["states"][string]
  | ExtractReActorMethodReturnType<A[M]>
  | boolean
  | Error
  | undefined

export type ReActorSubscribeFunction<A, M extends keyof A> = (
  callback: (state: ReActorMethodState<A, M>["states"][string]) => void
) => () => void

export type ReActorCallFunction<A, M extends keyof A> = (
  replaceArgs?: ExtractReActorMethodArgs<A[M]>
) => Promise<ExtractReActorMethodReturnType<A[M]>>

// Type for the return value of a ReActor call
export type ReActorQueryReturn<A, M extends keyof A> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ReActorGetStateFunction<A, M>
  subscribe: ReActorSubscribeFunction<A, M>
  recall: ReActorCallFunction<A, M>
  initialData: Promise<ExtractReActorMethodReturnType<A[M]>>
}

export type ReActorUpdateReturn<A, M extends keyof A> = {
  requestHash: string
  getState: ReActorGetStateFunction<A, M>
  subscribe: ReActorSubscribeFunction<A, M>
  call: ReActorCallFunction<A, M>
}

export type ReActorQueryArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractReActorMethodArgs<A[M]>
  disableInitialCall?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export type ReActorUpdateArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractReActorMethodArgs<A[M]>
}

// Function type for calling a ReActor method
export type ReActorMethod<A = Record<string, ActorMethod>> = <
  M extends keyof A
>(
  functionName: M,
  ...args: ExtractReActorMethodArgs<A[M]>
) => ReActorUpdateReturn<A, M>

export type ReActorQuery<A = Record<string, ActorMethod>> = <M extends keyof A>(
  options: ReActorQueryArgs<A, M>
) => ReActorQueryReturn<A, M>

export type ReActorUpdate<A = Record<string, ActorMethod>> = <
  M extends keyof A
>(
  options: ReActorUpdateArgs<A, M>
) => ReActorUpdateReturn<A, M>

export interface ReActorCoreActions<A extends ActorSubclass<any>> {
  queryCall: ReActorQuery<A>
  updateCall: ReActorUpdate<A>
}
