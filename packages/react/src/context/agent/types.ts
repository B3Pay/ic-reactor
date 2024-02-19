import React, { PropsWithChildren } from "react"
import type { AgentManagerOptions } from "@ic-reactor/core/dist/types"
import type { AgentManager } from "@ic-reactor/core/dist/agent"
import type { getAuthHooks } from "../../helpers/auth"
import type { getAgentHooks } from "../../helpers/agent"

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
