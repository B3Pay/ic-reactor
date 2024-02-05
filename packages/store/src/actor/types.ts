import type {
  ActorMethod,
  ActorSubclass,
  HttpAgent,
  Identity,
} from "@dfinity/agent"
import type { IDL } from "@dfinity/candid"
import type { Principal } from "@dfinity/principal"
import type { StoreApi } from "zustand"
import type { ExtractedServiceFields } from "./candid/fields"
import type { AgentManager } from "../agent"
import { FunctionName } from "./candid"

export type { ActorMethod, IDL, ActorSubclass, Principal, HttpAgent, Identity }

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
  withServiceFields?: boolean
  withServiceDetails?: boolean
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

// Actions available on a ReActor
export interface ActorActions<A extends ActorSubclass<any> = DefaultActorType> {
  agentManager: AgentManager
  actorStore: ActorStore<A>
  methodFields: ExtractedServiceFields<A>
  authenticate: () => Promise<void>
  unsubscribeActor: () => void
  updateMethodState: (newState: Partial<ActorState<A>["methodState"]>) => void
  callMethod: CallActorMethod<A>
}
