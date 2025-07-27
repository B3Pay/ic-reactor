import type { AgentManager } from "../agent"
import type {
  IDL,
  ActorMethod,
  ActorSubclass,
  Principal,
  StoreWithAllMiddleware,
} from "../../types"
import type { AgentError, CallConfig } from "@dfinity/agent"

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
export type ActorMethodParameters<T> = T extends ActorMethod<
  infer Args,
  unknown
>
  ? Args
  : never

// Extracts the return type of an ActorMethod

export type ActorMethodReturnType<T> = T extends ActorMethod<
  unknown[],
  infer Ret
>
  ? Ret
  : never

/**
 * Interface representing the state of each actor method.
 *
 * @template A - The actor type, defaulting to `BaseActor`.
 * @template M - A specific method name of the actor.
 */
export interface ActorMethodState<
  A = BaseActor,
  M extends FunctionName<A> = FunctionName<A>
> {
  /**
   * The per-method state object, keyed by the method name.
   */

  [key: string]: {
    /**
     * The data returned from the actor method call, if available.
     */
    data: ActorMethodReturnType<A[M]> | undefined
    /**
     * @deprecated Use `isLoading` instead.
     * Flag indicating whether the actor method is in progress.
     */
    loading: boolean
    /**
     * Flag indicating whether the actor method is in progress.
     */

    isLoading: boolean
    /**
     * Error thrown during the actor method invocation, if any.
     */
    error: AgentError | undefined
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
/**
 * Represents the state of an actor.
 *
 * @template A - The type of the actor, defaults to `BaseActor`.
 */
export type ActorState<A = BaseActor> = {
  /**
   * The name of the actor.
   */
  name: string

  /**
   * The version of the actor.
   */
  version: number

  /**
   * @deprecated Use `isInitialized` instead.
   * Indicates whether the actor is initialized.
   */
  initialized: boolean

  /**
   * Indicates whether the actor is initialized.
   */
  isInitialized: boolean

  /**
   * @deprecated Use `isInitializing` instead.
   * Indicates whether the actor is in the process of initializing.
   */
  initializing: boolean

  /**
   * Indicates whether the actor is in the process of initializing.
   */
  isInitializing: boolean

  /**
   * The error associated with the actor, if any.
   */
  error: AgentError | undefined

  /**
   * The state of the actor's methods.
   */
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
