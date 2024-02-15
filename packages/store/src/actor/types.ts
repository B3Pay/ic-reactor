import type { IDL } from "@dfinity/candid"
import type { StoreApi } from "zustand"
import type { AgentManager } from "../agent"
import type { ActorMethod, ActorSubclass, Principal } from "../types"

export type FunctionName<A = DefaultActorType> = keyof A & string

export type FunctionType = "query" | "update"

export interface DefaultActorType {
  [key: string]: ActorMethod<any, any>
}

// Type for identifying a canister
export type CanisterId = string | Principal

export interface ActorManagerOptions {
  agentManager: AgentManager
  idlFactory: IDL.InterfaceFactory
  canisterId: CanisterId
  withVisitor?: boolean
  withDevtools?: boolean
  initializeOnCreate?: boolean
}

export type ExtractVisitorType<T> = T extends IDL.Visitor<infer U, infer V>
  ? { data: U; return: V }
  : never

export type ExtractedService<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> = {
  [K in M]: <V extends IDL.Visitor<any, any>>(
    extractorClass: V,
    data?: ExtractVisitorType<V>["data"]
  ) => ReturnType<V["visitFunc"]>
}

// Utility types for extracting method arguments and return types
export type ExtractActorMethodArgs<T> = T extends ActorMethod<infer A>
  ? A
  : never

export type ExtractActorMethodReturnType<T> = T extends ActorMethod<
  any,
  infer R
>
  ? R
  : never

export interface ActorMethodState<A, M extends FunctionName<A>> {
  [key: string]: {
    data: ExtractActorMethodReturnType<A[M]> | undefined
    loading: boolean
    error: Error | undefined
  }
}

export type ActorMethodStates<A> = {
  [M in FunctionName<A>]: ActorMethodState<A, M>
}

// State structure for an actor in a ReActor
export type ActorState<A> = {
  initialized: boolean
  initializing: boolean
  error: Error | undefined
  methodState: ActorMethodStates<A>
}

export type ActorStore<A extends ActorSubclass<any> = DefaultActorType> =
  StoreApi<ActorState<A>>

// Function type for directly calling a method on an actor
export type CallActorMethod<A = Record<string, ActorMethod>> = <
  M extends FunctionName<A>
>(
  functionName: M,
  ...args: ExtractActorMethodArgs<A[M]>
) => Promise<ExtractActorMethodReturnType<A[M]>>
