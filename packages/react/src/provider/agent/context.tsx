import React, { createContext, useMemo } from "react"
import { createAgentManager } from "@ic-reactor/core"
import { getAgentHooks } from "../../helpers/agent"
import { getAuthHooks } from "../../helpers/auth"
import type { AgentManagerOptions } from "@ic-reactor/core/dist/types"
import type {
  CreateAgentContextReturn,
  AgentProviderProps,
  AgentContext,
} from "./types"
import { extractAgentHooks } from "./hooks"

export const createAgentContext = (
  agentConfig: Partial<AgentManagerOptions> = {}
): CreateAgentContextReturn => {
  const AgentContext = createContext<AgentContext | null>(null)

  const AgentProvider: React.FC<AgentProviderProps> = ({
    children,
    agentManager: mybeAgentManager,
    ...config
  }) => {
    const hooks = useMemo(() => {
      const agentManager =
        mybeAgentManager ?? createAgentManager({ ...config, ...agentConfig })

      return {
        ...getAgentHooks(agentManager),
        ...getAuthHooks(agentManager),
        agentManager,
      }
    }, [config])

    return (
      <AgentContext.Provider value={hooks}>{children}</AgentContext.Provider>
    )
  }

  AgentProvider.displayName = "AgentProvider"

  return { AgentProvider, ...extractAgentHooks(AgentContext) }
}
