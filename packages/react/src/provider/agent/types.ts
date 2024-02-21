import { PropsWithChildren } from "react"
import type { AgentManagerOptions } from "@ic-reactor/core/dist/types"
import type { AgentManager } from "@ic-reactor/core/dist/agent"
import { AgentHooks, AuthHooks } from "../../types"

export interface AgentContext extends AgentHooks, AuthHooks {
  agentManager: AgentManager
}

export interface CreateAgentContextReturn extends AgentHooks, AuthHooks {
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
