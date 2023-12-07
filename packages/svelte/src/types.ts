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
import type { Writable } from "svelte/store"
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
export type ReActorStore<A extends ActorSubclass<any>> = Writable<
  ReActorState<A>
>

// Type for the ReActor itself, combining state and actions
export type ReActor<A extends ActorSubclass<any>> = [
  ReActorState<A>,
  ReActorStoreActions<A>
]

export type ReActorGetStateFunction<A, M extends keyof A> = {
  (key: "data"): ExtractReActorMethodReturnType<A[M]> | undefined
  (key: "loading"): boolean
  (key: "error"): Error | undefined
  (): ReActorMethodState<A, M>["states"][string]
}

export type ReActorSubscribeFunction<A, M extends keyof A> = (
  callback: (state: ReActorMethodState<A, M>["states"][string]) => void
) => () => void

export type ReActorCallFunction<A, M extends keyof A> = (
  replaceArgs?: ExtractReActorMethodArgs<A[M]>
) => Promise<ExtractReActorMethodReturnType<A[M]>>

// Type for the return value of a ReActor call
export type ReActorQueryReturn<A, M extends keyof A> = {
  intervalId: NodeJS.Timeout | null
  requestHash: string
  getState: ReActorGetStateFunction<A, M>
  subscribe: ReActorSubscribeFunction<A, M>
  recall: ReActorCallFunction<A, M>
  initialData: Promise<ExtractReActorMethodReturnType<A[M]>>
}

export type ReActorUpdateReturn<A, M extends keyof A> = {
  requestHash: string
  getState: ReActorGetStateFunction<A, M>
  subscribe: ReActorSubscribeFunction<A, M>
  call: ReActorCallFunction<A, M>
}

export type ReActorQueryArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractReActorMethodArgs<A[M]>
  disableInitialCall?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

export type ReActorUpdateArgs<A, M extends keyof A> = {
  functionName: M
  args?: ExtractReActorMethodArgs<A[M]>
}

// Function type for calling a ReActor method
export type ReActorMethod<A = Record<string, ActorMethod>> = <
  M extends keyof A
>(
  functionName: M,
  ...args: ExtractReActorMethodArgs<A[M]>
) => ReActorUpdateReturn<A, M>

export type ReActorQuery<A = Record<string, ActorMethod>> = <M extends keyof A>(
  options: ReActorQueryArgs<A, M>
) => ReActorQueryReturn<A, M>

export type ReActorUpdate<A = Record<string, ActorMethod>> = <
  M extends keyof A
>(
  options: ReActorUpdateArgs<A, M>
) => ReActorUpdateReturn<A, M>

export interface ReActorCoreActions<A extends ActorSubclass<any>> {
  queryCall: ReActorQuery<A>
  updateCall: ReActorUpdate<A>
}
