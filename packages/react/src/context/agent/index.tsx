import React, { createContext, useMemo, useContext } from "react"
import { AgentManagerOptions, createAgentManager } from "@ic-reactor/core"
import {
  AgentContextValue,
  AgentContextType,
  AgentProviderProps,
} from "./types"
import { getAgentHooks } from "../../hooks/agent"
import { getAuthHooks } from "../../hooks/auth"

export * from "./types"
export * from "./hooks"

export const AgentManagerContext = createContext<AgentContextValue | null>(null)

export const useAgentManagerContext = (agentContext?: AgentContextType) => {
  const context = useContext(agentContext || AgentManagerContext)

  if (!context) {
    throw new Error("Agent context must be used within a AgentProvider")
  }

  return context
}

export const createAgentContext = (
  config: AgentManagerOptions
): AgentContextValue => {
  const agentManager = createAgentManager(config)
  const agenthooks = getAgentHooks(agentManager)
  const authHooks = getAuthHooks(agentManager)

  return { ...agenthooks, ...authHooks, agentManager }
}

const AgentProvider: React.FC<AgentProviderProps> = ({
  children,
  ...config
}) => {
  const value = useMemo(() => createAgentContext(config), [config])

  return (
    <AgentManagerContext.Provider value={value}>
      {children}
    </AgentManagerContext.Provider>
  )
}

AgentProvider.displayName = "AgentProvider"

export { AgentProvider }
