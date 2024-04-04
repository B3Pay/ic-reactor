import type { IDL } from "@dfinity/candid"
import {
  ActorHooksReturnType,
  ActorManagerParameters,
  BaseActor,
} from "../types"

export interface UseActorParameters
  extends Omit<
    ActorManagerParameters,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  canisterId: string
  idlFactory?: IDL.InterfaceFactory
  didjsCanisterId?: string
}

export interface UseActorReturn<A = BaseActor> {
  hooks: ActorHooksReturnType<A> | null
  fetching: boolean
  fetchError: string | null
  authenticating: boolean
}
