// Importing necessary types from external libraries
import type {
  ActorMethod,
  ActorSubclass,
  HttpAgent,
  HttpAgentOptions,
  Identity,
} from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { InterfaceFactory } from "@dfinity/candid/lib/cjs/idl"
import type { Principal } from "@dfinity/principal"
import type { StoreApi } from "zustand"
import { ExtractedField } from "./candid"
export type {
  ActorMethod,
  ActorSubclass,
  HttpAgent,
  Identity,
} from "@dfinity/agent"

// Type for identifying a canister
export type CanisterId = string | Principal

export interface ReActorOptions extends HttpAgentOptions {
  idlFactory: InterfaceFactory
  canisterId: CanisterId
  isLocal?: boolean
  withDevtools?: boolean
  initializeOnMount?: boolean
}

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

export interface ReActorMethodField<A> {
  functionName: keyof A & string
  fields: ExtractedField[]
  defaultValues: {
    data: { [K in `${Extract<keyof A, string>}-arg${number}`]: any }
  }
}

export interface ReActorMethodState<A, M extends keyof A> {
  [argHash: string]: {
    data: ExtractReActorMethodReturnType<A[M]> | undefined
    loading: boolean
    error: Error | undefined
  }
}

export type ReActorMethodStates<A> = {
  [M in keyof A]: ReActorMethodState<A, M>
}

// State structure for an actor in a ReActor
export type ReActorActorState<A> = {
  actor: A | null
  initialized: boolean
  initializing: boolean
  error: Error | undefined
  methodState: ReActorMethodStates<A>
  methodFields: ReActorMethodField<A>[]
}

export type ReActorAgentState = {
  agentOptions?: HttpAgentOptions
  agent?: HttpAgent
}

// Main state structure for a ReActor
export interface ReActorAuthState<A> {
  identity: Identity | null
  authClient: AuthClient | null
  authenticating: boolean
  authenticated: boolean
  error: Error | undefined
}

// Function type for directly calling a method on an actor
export type CallMethod<A = Record<string, ActorMethod>> = <M extends keyof A>(
  functionName: M,
  ...args: ExtractReActorMethodArgs<A[M]>
) => Promise<ExtractReActorMethodReturnType<A[M]>>

// Actions available on a ReActor
export interface ReActorActions<A extends ActorSubclass<any>> {
  initialize: (identity?: Identity) => void
  authenticate: () => Promise<void>
  resetState: () => void
  updateState: (newState: Partial<ReActorAuthState<A>>) => void
  callMethod: CallMethod<A>
}

// Type for the ReActor store
export type ReActorAgentStore = StoreApi<ReActorAgentState>

export type ReActorAuthStore<A extends ActorSubclass<any>> = StoreApi<
  ReActorAuthState<A>
>

export type ReActorActorStore<A extends ActorSubclass<any>> = StoreApi<
  ReActorActorState<A>
>
