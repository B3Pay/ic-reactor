import type {
  ActorMethod,
  ActorSubclass,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ActorMethodState,
} from "@ic-reactor/store"

export type ActorGetStateFunction<A, M extends keyof A> = {
  (key: "data"): ExtractActorMethodReturnType<A[M]> | undefined
  (key: "loading"): boolean
  (key: "error"): Error | undefined
  (): ActorMethodState<A, M>[string]
}

export type ActorSubscribeFunction<A, M extends keyof A> = (
  callback: (state: ActorMethodState<A, M>[string]) => void
) => () => void

export type ActorCallFunction<A, M extends keyof A> = (
  replaceArgs?: ExtractActorMethodArgs<A[M]>
) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>

// Type for the return value of a Actor call
export type ActorQueryReturn<A, M extends keyof A> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
  initialData: Promise<ExtractActorMethodReturnType<A[M]> | undefined>
}

export type ActorUpdateReturn<A, M extends keyof A> = {
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
}

export type ActorQueryArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractActorMethodArgs<A[M]>
  disableInitialCall?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export type ActorUpdateArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractActorMethodArgs<A[M]>
}

// Function type for calling a Actor method
export type ActorMethodCall<A = Record<string, ActorMethod>> = <
  M extends keyof A
>(
  functionName: M,
  ...args: ExtractActorMethodArgs<A[M]>
) => ActorUpdateReturn<A, M>

export type ActorQuery<A = Record<string, ActorMethod>> = <M extends keyof A>(
  options: ActorQueryArgs<A, M>
) => ActorQueryReturn<A, M>

export type ActorUpdate<A = Record<string, ActorMethod>> = <M extends keyof A>(
  options: ActorUpdateArgs<A, M>
) => ActorUpdateReturn<A, M>

export interface ActorCoreActions<A extends ActorSubclass<any>> {
  queryCall: ActorQuery<A>
  updateCall: ActorUpdate<A>
}
