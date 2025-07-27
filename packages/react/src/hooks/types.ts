import {
  IDL,
  ActorHooksReturnType,
  ActorManagerParameters,
  BaseActor,
  CanisterId,
  ActorManager,
} from "../types"

export type ActorReConfigParameters = Omit<
  ActorManagerParameters,
  "idlFactory" | "canisterId" | "agentManager"
>

export interface UseActorParameters extends ActorReConfigParameters {
  candidString?: string
  canisterId: CanisterId
  idlFactory?: IDL.InterfaceFactory
  disableAutoFetch?: boolean
}

export interface UseActorManagerParameters<A> extends ActorReConfigParameters {
  actorManager: ActorManager<A>
}

export interface UseActorReturn<A = BaseActor> {
  hooks: ActorHooksReturnType<A> | null
  isFetching: boolean
  fetchError: string | null
  isAuthenticating: boolean
  initializeActor: InitializeActor
}

export interface UseActorManagerReturn<A = BaseActor> {
  hooks: ActorHooksReturnType<A>
}

export type InitializeActor = (
  idlFactory: IDL.InterfaceFactory,
  actorReConfig?: ActorReConfigParameters
) => void
