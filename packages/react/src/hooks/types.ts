import type { IDL } from "@dfinity/candid"
import {
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
  canisterId: CanisterId
  idlFactory?: IDL.InterfaceFactory
  didjsCanisterId?: string
}

export interface UseActorReturn<A = BaseActor> {
  hooks: ActorHooksReturnType<A> | null
  fetching: boolean
  fetchError: string | null
  authenticating: boolean
}
