import type {
  ActorMethod,
  ActorSubclass,
  HttpAgentOptions,
  HttpAgent,
  Identity,
} from "@dfinity/agent"
import type { Principal } from "@dfinity/principal"
import type { IDL } from "@dfinity/candid"
import type { ActorManager } from "./actor"
import type {
  ActorManagerOptions,
  ActorMethodArgs,
  ActorMethodReturnType,
  ActorMethodState,
  BaseActor,
  FunctionName,
} from "./actor/types"
import type { AgentManager } from "./agent"
import type { AuthClientLoginOptions } from "@dfinity/auth-client"

export * from "./agent/types"
export * from "./actor/types"
export * from "./candid/types"

export type {
  ActorMethod,
  HttpAgentOptions,
  ActorSubclass,
  Principal,
  HttpAgent,
  Identity,
  IDL,
}

export interface CreateReactorOptions extends CreateReactorStoreOptions {
  withProcessEnv?: boolean
}

export interface CreateReactorStoreOptions
  extends HttpAgentOptions,
    Omit<ActorManagerOptions, "agentManager"> {
  agentManager?: AgentManager
  isLocalEnv?: boolean
  port?: number
}

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

export interface ReactorCore<A = BaseActor>
  extends AgentManager,
    Omit<ActorManager<A>, "updateMethodState"> {
  login: (options?: AuthClientLoginOptions) => Promise<void>
  logout: (options?: { returnTo?: string }) => Promise<void>
  queryCall: ActorQuery<A>
  updateCall: ActorUpdate<A>
}
