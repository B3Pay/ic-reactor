import { IDL } from "@dfinity/candid"
import { ActorManagerOptions, BaseActor } from "@ic-reactor/core/dist/types"
import { ActorHooks, AgentContext } from "../../types"

export interface CreateActorContextReturn<A = BaseActor> extends ActorHooks<A> {
  ActorProvider: React.FC<ActorProviderProps>
}

export interface CreateActorContextOptions
  extends Omit<
    ActorManagerOptions,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  didjsId?: string
  canisterId?: string
  agentContext?: React.Context<AgentContext | null>
  idlFactory?: IDL.InterfaceFactory
  loadingComponent?: React.ReactNode
}

export interface ActorProviderProps extends CreateActorContextOptions {
  children?: React.ReactNode | undefined
  loadingComponent?: React.ReactNode
}
