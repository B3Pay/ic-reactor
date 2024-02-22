import type {
  IDL,
  ActorHooksReturnType,
  AgentHooksReturnType,
  AuthHooksReturnType,
  BaseActor,
  AgentManager,
  ActorManagerParameters,
  AgentManagerParameters,
} from "../types"
import type { PropsWithChildren } from "react"

export * from "./hooks/types"

export interface AgentContext
  extends AgentHooksReturnType,
    AuthHooksReturnType {
  agentManager: AgentManager
}

export interface CreateAgentContextReturnType
  extends AgentHooksReturnType,
    AuthHooksReturnType {
  useAgentManager: (
    agentContext?: React.Context<AgentContext | null>
  ) => AgentManager
  AgentProvider: React.FC<AgentProviderProps>
}

export interface AgentProviderProps
  extends PropsWithChildren,
    AgentManagerParameters {
  agentManager?: AgentManager
}

export interface CreateActorContextReturnType<A = BaseActor>
  extends ActorHooksReturnType<A> {
  ActorProvider: React.FC<ActorProviderProps>
}

export interface ActorProviderProps extends CreateActorContextParameters {
  children?: React.ReactNode | undefined
  loadingComponent?: React.ReactNode
}

export interface CreateActorContextParameters
  extends Omit<
    ActorManagerParameters,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  didjsId?: string
  canisterId?: string
  agentContext?: React.Context<AgentContext | null>
  idlFactory?: IDL.InterfaceFactory
  loadingComponent?: React.ReactNode
}
