import type {
  IDL,
  GetActorHooks,
  GetAgentHooks,
  GetAuthHooks,
  ActorManagerOptions,
  BaseActor,
  AgentManagerOptions,
} from "../types"
import type { AgentManager } from "@ic-reactor/core/dist/agent"
import type { PropsWithChildren } from "react"

export interface AgentContext extends GetAgentHooks, GetAuthHooks {
  agentManager: AgentManager
}

export interface CreateAgentContextReturn extends GetAgentHooks, GetAuthHooks {
  useAgentManager: (
    agentContext?: React.Context<AgentContext | null>
  ) => AgentManager
  AgentProvider: React.FC<AgentProviderProps>
}

export interface AgentProviderProps
  extends PropsWithChildren,
    AgentManagerOptions {
  agentManager?: AgentManager
}

export interface CreateActorContextReturn<A = BaseActor>
  extends GetActorHooks<A> {
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
