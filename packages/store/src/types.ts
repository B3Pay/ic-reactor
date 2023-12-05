// Importing necessary types from external libraries
import type {
  ActorMethod,
  ActorSubclass,
  HttpAgent,
  Identity,
} from "@dfinity/agent"
import { AuthClient } from "@dfinity/auth-client"
import { FuncClass } from "@dfinity/candid/lib/cjs/idl"
import type { Principal } from "@dfinity/principal"
import type { StoreApi } from "zustand"

export type {
  ActorMethod,
  ActorSubclass,
  HttpAgent,
  Identity,
} from "@dfinity/agent"

// Type for identifying a canister
export type CanisterId = string | Principal

// Type for initializing an actor
export type InitializeActorType = (agent: HttpAgent) => ActorSubclass<any>

// Utility types for extracting method arguments and return types
export type ExtractReActorMethodArgs<T> = T extends ActorMethod<infer A>
  ? A
  : never
export type ExtractReActorMethodReturnType<T> = T extends ActorMethod<
  any,
  infer R
>
  ? R
  : never

// State structure for a method in a ReActor
export interface ReActorMethodState<A, M extends keyof A> {
  types: FuncClass
  states: {
    [argHash: string]: {
      data: ExtractReActorMethodReturnType<A[M]> | undefined
      loading: boolean
      error: Error | undefined
    }
  }
}

// State structure for an actor in a ReActor
export type ReActorActorState<A> = {
  [M in keyof A]: ReActorMethodState<A, M>
}

// Main state structure for a ReActor
export interface ReActorState<A> {
  actorState: ReActorActorState<A>
  identity: Identity | null
  authClient: AuthClient | null
  authenticating: boolean
  authenticated: boolean
  initialized: boolean
  initializing: boolean
  loading: boolean
  error: Error | undefined
}

// Function type for directly calling a method on an actor
export type CallMethod<A = Record<string, ActorMethod>> = <M extends keyof A>(
  functionName: M,
  ...args: ExtractReActorMethodArgs<A[M]>
) => Promise<ExtractReActorMethodReturnType<A[M]>>

// Actions available on a ReActor
export interface ReActorStoreActions<A extends ActorSubclass<any>> {
  initialize: (identity?: Identity) => void
  authenticate: () => Promise<void>
  resetState: () => void
  updateState: (newState: Partial<ReActorState<A>>) => void
  callMethod: CallMethod<A>
}

// Type for the ReActor store
export type ReActorStore<A extends ActorSubclass<any>> = StoreApi<
  ReActorState<A>
>

// Type for the ReActor itself, combining state and actions
export type ReActor<A extends ActorSubclass<any>> = [
  ReActorState<A>,
  ReActorStoreActions<A>
]
