import { IDL } from "@dfinity/candid"
import { ActorManagerOptions, BaseActor } from "@ic-reactor/core/dist/types"
import { ActorHooks, AgentContext } from "../types"

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
  hooks: ActorHooks<A> | null
  fetching: boolean
  fetchError: string | null
}
