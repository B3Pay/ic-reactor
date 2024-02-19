import React, { createContext, useMemo } from "react"
import { createAgentManager } from "@ic-reactor/core"
import { getAgentHooks } from "../../hooks/agent"
import { getAuthHooks } from "../../hooks/auth"
import type { AgentManagerOptions } from "@ic-reactor/core/dist/types"
import type { AgentContextValue, AgentProviderProps } from "./types"

export const AgentContext = createContext<AgentContextValue | null>(null)

const AgentProvider: React.FC<AgentProviderProps> = ({
  children,
  ...config
}) => {
  const value = useMemo(() => createAgentContext(config), [config])

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

AgentProvider.displayName = "AgentProvider"

export { AgentProvider }

const createAgentContext = (config: AgentManagerOptions): AgentContextValue => {
  const agentManager = createAgentManager(config)
  const agenthooks = getAgentHooks(agentManager)
  const authHooks = getAuthHooks(agentManager)

  return { ...agenthooks, ...authHooks, agentManager }
}
