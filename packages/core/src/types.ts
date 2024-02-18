import type {
  ActorMethod,
  ActorMethodArgs,
  ActorMethodReturnType,
  ActorMethodState,
  ActorStore,
  AgentManager,
  BaseActor,
  CanisterId,
  FunctionName,
  UpdateAgentOptions,
  VisitService,
} from "@ic-reactor/store"

export type ActorGetStateFunction<A, M extends FunctionName<A>> = {
  (key: "data"): ActorMethodReturnType<A[M]>
  (key: "loading"): boolean
  (key: "error"): Error | undefined
  (): ActorMethodState<A, M>[string]
}

export type ActorSubscribeFunction<A, M extends FunctionName<A>> = (
  callback: (state: ActorMethodState<A, M>[string]) => void
) => () => void

export type ActorCallFunction<A, M extends FunctionName<A>> = (
  replaceArgs?: ActorMethodArgs<A[M]>
) => Promise<ActorMethodReturnType<A[M]>>

// Type for the return value of a Actor call
export type ActorQueryReturn<A, M extends FunctionName<A>> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
  dataPromise: Promise<ActorMethodReturnType<A[M]>>
}

export type ActorUpdateReturn<A, M extends FunctionName<A>> = {
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
}

export type ActorQueryArgs<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodArgs<A[M]>
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export type ActorUpdateArgs<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodArgs<A[M]>
}

// Function type for calling a Actor method
export type ActorMethodCall<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  functionName: M,
  ...args: ActorMethodArgs<A[M]>
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

export interface ActorCoreActions<A = BaseActor> {
  actorStore: ActorStore<A>
  agentManager: AgentManager
  canisterId: CanisterId
  getActor: () => null | A
  initialize: (options?: UpdateAgentOptions) => Promise<void>
  unsubscribeAgent: () => void
  queryCall: ActorQuery<A>
  updateCall: ActorUpdate<A>
  visitFunction: VisitService<A>
}
