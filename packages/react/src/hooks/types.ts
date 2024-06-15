import {
  IDL,
  ActorHooksReturnType,
  ActorManagerParameters,
  BaseActor,
  CanisterId,
} from "../types"

export interface UseActorParameters
  extends Omit<
    ActorManagerParameters,
    "idlFactory" | "agentManager" | "canisterId"
  > {
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
  actorReConfig?: UseActorParameters
) => void
