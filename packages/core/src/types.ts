import type {
  ActorMethod,
  ActorSubclass,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ActorMethodState,
} from "@ic-reactor/store"

export type ReActorGetStateFunction<A, M extends keyof A> = {
  (key: "data"): ExtractActorMethodReturnType<A[M]> | undefined
  (key: "loading"): boolean
  (key: "error"): Error | undefined
  (): ActorMethodState<A, M>[string]
}

export type ReActorSubscribeFunction<A, M extends keyof A> = (
  callback: (state: ActorMethodState<A, M>[string]) => void
) => () => void

export type ReActorCallFunction<A, M extends keyof A> = (
  replaceArgs?: ExtractActorMethodArgs<A[M]>
) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>

// Type for the return value of a ReActor call
export type ReActorQueryReturn<A, M extends keyof A> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ReActorGetStateFunction<A, M>
  subscribe: ReActorSubscribeFunction<A, M>
  call: ReActorCallFunction<A, M>
  initialData: Promise<ExtractActorMethodReturnType<A[M]> | undefined>
}

export type ReActorUpdateReturn<A, M extends keyof A> = {
  requestHash: string
  getState: ReActorGetStateFunction<A, M>
  subscribe: ReActorSubscribeFunction<A, M>
  call: ReActorCallFunction<A, M>
}

export type ReActorQueryArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractActorMethodArgs<A[M]>
  disableInitialCall?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export type ReActorUpdateArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractActorMethodArgs<A[M]>
}

// Function type for calling a ReActor method
export type ReActorMethod<A = Record<string, ActorMethod>> = <
  M extends keyof A
>(
  functionName: M,
  ...args: ExtractActorMethodArgs<A[M]>
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
