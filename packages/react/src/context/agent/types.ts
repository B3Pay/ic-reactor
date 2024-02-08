import React, { PropsWithChildren } from "react"
import { AgentManager, AgentManagerOptions } from "@ic-reactor/store"
import { getAuthHooks } from "../../hooks/auth"

export type AgentContextValue = ReturnType<typeof getAuthHooks> & {
  agentManager: AgentManager
}

export type AgentContextType = React.Context<AgentContextValue | null>

export interface AgentProviderProps
  extends PropsWithChildren,
    AgentManagerOptions {
  agentManager?: AgentManager
}
