import React, { PropsWithChildren } from "react"
import { AgentManager, AgentManagerOptions } from "@ic-reactor/core"
import { getAuthHooks } from "../../hooks/auth"
import { getAgentHooks } from "../../hooks/agent"

export type AgentContextValue = ReturnType<typeof getAuthHooks> &
  ReturnType<typeof getAgentHooks> & {
    agentManager: AgentManager
  }

export type AgentContextType = React.Context<AgentContextValue | null>

export interface AgentProviderProps
  extends PropsWithChildren,
    AgentManagerOptions {
  agentManager?: AgentManager
}
