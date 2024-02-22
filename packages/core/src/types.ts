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
  ActorManagerParameters,
  ActorMethodParameters,
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

export interface CreateReactorStoreParameters
  extends HttpAgentOptions,
    Omit<ActorManagerParameters, "agentManager"> {
  agentManager?: AgentManager
  withProcessEnv?: boolean
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
  replaceArgs?: ActorMethodParameters<A[M]>
) => Promise<ActorMethodReturnType<A[M]>>

// Type for the return value of a Actor call
export type ActorQueryReturnType<A, M extends FunctionName<A>> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
  dataPromise: Promise<ActorMethodReturnType<A[M]>>
}

export type ActorUpdateReturnType<A, M extends FunctionName<A>> = {
  requestHash: string
  getState: ActorGetStateFunction<A, M>
  subscribe: ActorSubscribeFunction<A, M>
  call: ActorCallFunction<A, M>
}

export type ActorQueryParameters<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodParameters<A[M]>
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export type ActorUpdateParameters<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodParameters<A[M]>
}

// Function type for calling a Actor method
export type ActorMethodCall<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  functionName: M,
  ...args: ActorMethodParameters<A[M]>
) => ActorUpdateReturnType<A, M>

export type ActorQuery<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  config: ActorQueryParameters<A, M>
) => ActorQueryReturnType<A, M>

export type ActorUpdate<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  config: ActorUpdateParameters<A, M>
) => ActorUpdateReturnType<A, M>

export interface CreateReactorCoreParameters
  extends CreateReactorStoreParameters {
  withProcessEnv?: boolean
}

export interface CreateReactorCoreReturnType<A = BaseActor>
  extends AgentManager,
    Omit<ActorManager<A>, "updateMethodState"> {
  login: (config?: AuthClientLoginOptions) => Promise<void>
  logout: (config?: { returnTo?: string }) => Promise<void>
  queryCall: ActorQuery<A>
  updateCall: ActorUpdate<A>
}
