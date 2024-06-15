import {
  IDL,
  ActorHooksReturnType,
  ActorManagerParameters,
  BaseActor,
  CanisterId,
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

export interface UseActorReturn<A = BaseActor> {
  hooks: ActorHooksReturnType<A> | null
  fetching: boolean
  fetchError: string | null
  authenticating: boolean
  initializeActor: InitializeActor
}

export type InitializeActor = (
  idlFactory: IDL.InterfaceFactory,
  actorReConfig?: ActorReConfigParameters
) => void
