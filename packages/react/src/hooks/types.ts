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
  candidString?: string
  canisterId: CanisterId
  idlFactory?: IDL.InterfaceFactory
}

export interface UseActorReturn<A = BaseActor> {
  hooks: ActorHooksReturnType<A> | null
  fetching: boolean
  fetchError: string | null
  authenticating: boolean
}
