import type { IDL } from "@dfinity/candid"
import { AgentContext } from "../types"
import { GetActorHooks, ActorManagerOptions, BaseActor } from "../../types"

export interface UseActorOptions
  extends Omit<
    ActorManagerOptions,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  canisterId: string
  idlFactory?: IDL.InterfaceFactory
  agentContext?: React.Context<AgentContext | null>
  didjsCanisterId?: string
}

export interface UseActorReturn<A = BaseActor> {
  hooks: GetActorHooks<A> | null
  fetching: boolean
  fetchError: string | null
}
