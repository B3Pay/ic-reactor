import React, {
  createContext,
  PropsWithChildren,
  useMemo,
  useContext,
} from "react"
import {
  AgentManager,
  AgentManagerOptions,
  createAgentManager,
} from "@ic-reactor/store"
import { getAuthHooks } from "../hooks/auth"

export type AgentContextValue = ReturnType<typeof getAuthHooks> & {
  agentManager: AgentManager
}

export type AgentContextType = React.Context<AgentContextValue | null>

export const AgentContext = createContext<AgentContextValue | null>(null)

export const useAgent = (agentContext?: AgentContextType) => {
  const context = useContext(agentContext || AgentContext)

  if (!context) {
    throw new Error("useAgent must be used within a AgentProvider")
  }

  return context
}

export const useAgentManager = (
  agentContext?: AgentContextType
): AgentManager => {
  const context = useContext(agentContext || AgentContext)

  if (!context) {
    throw new Error("useAgentManager must be used within a AgentProvider")
  }

  return context.agentManager
}

interface AgentProviderProps extends PropsWithChildren, AgentManagerOptions {
  agentManager?: AgentManager
}

const AgentProvider: React.FC<AgentProviderProps> = ({
  children,
  ...config
}) => {
  const value = useMemo(() => {
    const agentManager = config.agentManager || createAgentManager(config)
    const hooks = getAuthHooks(agentManager)
    return { ...hooks, agentManager }
  }, [config])

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

AgentProvider.displayName = "AgentProvider"

export { AgentProvider }

export const createAgentContext = (
  config: AgentManagerOptions
): AgentContextValue => {
  const agentManager = createAgentManager(config)
  const hooks = getAuthHooks(agentManager)
  return { ...hooks, agentManager }
}
