import { IDL } from "@dfinity/candid"
import { ActorManagerOptions, BaseActor } from "@ic-reactor/core/dist/types"
import { ActorHooks, AgentContext } from "../types"

export interface UseReactorOptions
  extends Omit<
    ActorManagerOptions,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  canisterId: string
  idlFactory?: IDL.InterfaceFactory
  agentContext?: React.Context<AgentContext | null>
  didjsCanisterId?: string
}

export interface UseReactorState {
  idlFactory?: IDL.InterfaceFactory
  fetching: boolean
  fetchError: string | null
}

export interface UseReactorReturn<A = BaseActor> {
  hooks: ActorHooks<A> | null
  fetching: boolean
  fetchError: string | null
}
