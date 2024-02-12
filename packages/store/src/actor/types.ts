import type {
  ActorMethod,
  ActorSubclass,
  HttpAgent,
  Identity,
} from "@dfinity/agent"
import type { IDL } from "@dfinity/candid"
import type { Principal } from "@dfinity/principal"
import type { StoreApi } from "zustand"
import type { AgentManager } from "../agent"

export type { ActorMethod, IDL, ActorSubclass, Principal, HttpAgent, Identity }

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
  withDevtools?: boolean
  initializeOnCreate?: boolean
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
