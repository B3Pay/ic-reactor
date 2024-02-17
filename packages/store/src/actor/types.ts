import type { IDL } from "@dfinity/candid"
import type { StoreApi } from "zustand"
import type { AgentManager } from "../agent"
import type { ActorMethod, ActorSubclass, Principal } from "../types"

export interface DefaultActorType {
  [key: string]: ActorMethod
}

export type BaseActor<T = DefaultActorType> = ActorSubclass<T>

export type FunctionName<A = BaseActor> = keyof A & string

export type FunctionType = "query" | "update"

export type CanisterId = string | Principal

export interface ActorManagerOptions {
  agentManager: AgentManager
  idlFactory: IDL.InterfaceFactory
  canisterId: CanisterId
  withVisitor?: boolean
  withDevtools?: boolean
  initializeOnCreate?: boolean
}

export type ExtractVisitorType<V> = V extends IDL.Visitor<infer D, infer R>
  ? { data: D; returnType: R }
  : never

export type ExtractedService<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
> = {
  [K in M]: <V extends IDL.Visitor<unknown, unknown>>(
    extractorClass: V,
    data?: ExtractVisitorType<V>["data"]
  ) => ReturnType<V["visitFunc"]>
}

// Extracts the argument types of an ActorMethod
export type ExtractActorMethodArgs<T> = T extends ActorMethod<infer Args>
  ? Args
  : never

// Extracts the return type of an ActorMethod
export type ExtractActorMethodReturnType<T> = T extends ActorMethod<
  unknown[],
  infer Ret
>
  ? Ret
  : never

export interface ActorMethodState<A, M extends keyof A> {
  [key: string]: {
    data: ExtractActorMethodReturnType<A[M]> | undefined
    loading: boolean
    error: Error | undefined
  }
}

export type ActorMethodStates<A> = {
  [M in keyof A]: ActorMethodState<A, M>
}

// State structure for an actor in a ReActor
export type ActorState<A> = {
  initialized: boolean
  initializing: boolean
  error: Error | undefined
  methodState: ActorMethodStates<A>
}

export type ActorStore<A = BaseActor> = StoreApi<ActorState<A>>

// Function type for directly calling a method on an actor
export type CallActorMethod<A = BaseActor> = <M extends keyof A>(
  functionName: M,
  ...args: ExtractActorMethodArgs<A[M]>
) => Promise<ExtractActorMethodReturnType<A[M]>>
