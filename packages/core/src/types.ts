import type {
  ActorMethod,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ActorMethodState,
  FunctionName,
} from "@ic-reactor/store"

export type ActorGetStateFunction<A, M extends FunctionName<A>> = {
  (key: "data"): ExtractActorMethodReturnType<A[M]> | undefined
  (key: "loading"): boolean
  (key: "error"): Error | undefined
  (): ActorMethodState<A, M>[string]
}

export type ActorSubscribeFunction<A, M extends FunctionName<A>> = (
  callback: (state: ActorMethodState<A, M>[string]) => void
) => () => void

export type ActorCallFunction<A, M extends FunctionName<A>> = (
  replaceArgs?: ExtractActorMethodArgs<A[M]>
) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>

// Type for the return value of a Actor call
export type ActorQueryReturn<A, M extends FunctionName<A>> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
  initialData: Promise<ExtractActorMethodReturnType<A[M]> | undefined>
}

export type ActorUpdateReturn<A, M extends FunctionName<A>> = {
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
}

export type ActorQueryArgs<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ExtractActorMethodArgs<A[M]>
  callOnMount?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export type ActorUpdateArgs<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ExtractActorMethodArgs<A[M]>
}

// Function type for calling a Actor method
export type ActorMethodCall<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  functionName: M,
  ...args: ExtractActorMethodArgs<A[M]>
) => ActorUpdateReturn<A, M>

export type ActorQuery<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  options: ActorQueryArgs<A, M>
) => ActorQueryReturn<A, M>

export type ActorUpdate<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  options: ActorUpdateArgs<A, M>
) => ActorUpdateReturn<A, M>

export interface ActorCoreActions<A> {
  queryCall: ActorQuery<A>
  updateCall: ActorUpdate<A>
}
