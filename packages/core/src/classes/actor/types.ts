import type { AgentManager } from "../agent"
import type {
  IDL,
  ActorMethod,
  ActorSubclass,
  Principal,
  StoreWithAllMiddleware,
} from "../../types"
import { CallConfig } from "@dfinity/agent"

export interface DefaultActorType {
  [key: string]: ActorMethod
}

export type BaseActor<T = DefaultActorType> = ActorSubclass<T>

export type FunctionName<A = BaseActor> = Extract<keyof A, string>

export type FunctionType = "query" | "update"

export type CanisterId = string | Principal

export interface ActorManagerParameters {
  idlFactory: IDL.InterfaceFactory
  agentManager: AgentManager
  name?: string
  canisterId: CanisterId
  withVisitor?: boolean
  withDevtools?: boolean
  initializeOnCreate?: boolean
}

export type VisitorType<V> = V extends IDL.Visitor<infer D, infer R>
  ? { data: D; returnType: R }
  : never

export type VisitService<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
> = {
  [K in M]: <V extends IDL.Visitor<unknown, unknown>>(
    extractorClass: V,
    data: VisitorType<V>["data"]
  ) => ReturnType<V["visitFunc"]>
}

// Extracts the argument types of an ActorMethod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActorMethodParameters<T> = T extends ActorMethod<infer Args, any>
  ? Args
  : never

// Extracts the return type of an ActorMethod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActorMethodReturnType<T> = T extends ActorMethod<any, infer Ret>
  ? Ret
  : never

export interface ActorMethodState<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
> {
  [key: string]: {
    data: ActorMethodReturnType<A[M]> | undefined
    loading: boolean
    error: Error | undefined
  }
}

export type ActorMethodStates<A = BaseActor> = {
  [M in FunctionName<A>]: ActorMethodState<A, M>
}

export type ActorMethodType<A, M extends keyof A> = {
  (...args: ActorMethodParameters<A[M]>): Promise<ActorMethodReturnType<A[M]>>
  withOptions: (
    options: CallConfig
  ) => (
    ...args: ActorMethodParameters<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]>>
}

// State structure for an actor in a Reactor
export type ActorState<A = BaseActor> = {
  name: string
  version: number
  initialized: boolean
  initializing: boolean
  error: Error | undefined
  methodState: ActorMethodStates<A>
}

export type ActorStore<A = BaseActor> = StoreWithAllMiddleware<ActorState<A>>

// Function type for directly calling a method on an actor
export type CallActorMethod<A = BaseActor> = <
  M extends FunctionName<A> = FunctionName<A>
>(
  functionName: M,
  ...args: ActorMethodParameters<A[M]>
) => Promise<ActorMethodReturnType<A[M]>>

export type MethodAttributes<A = BaseActor> = Record<
  FunctionName<A>,
  {
    type: FunctionType
    numberOfArgs: number
    validate: (arg: never) => boolean
  }
>
