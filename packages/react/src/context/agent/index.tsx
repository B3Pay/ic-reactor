import React, {
  createContext,
  useMemo,
  useContext,
  useState,
  useEffect,
} from "react"
import {
  AgentManager,
  AgentManagerOptions,
  HttpAgent,
  createAgentManager,
} from "@ic-reactor/store"
import { getAuthHooks } from "../../hooks/auth"
import {
  AgentContextValue,
  AgentContextType,
  AgentProviderProps,
} from "./types"

export * from "./types"

export const AgentContext = createContext<AgentContextValue | null>(null)

export const useAgentContext = (agentContext?: AgentContextType) => {
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

export const useAgent = (
  agentContext?: AgentContextType
): HttpAgent | undefined => {
  const context = useContext(agentContext || AgentContext)

  if (!context) {
    throw new Error("useAgent must be used within a AgentProvider")
  }

  const [agent, setAgent] = useState<HttpAgent | undefined>(
    context.agentManager.getAgent()
  )

  useEffect(() => context.agentManager.subscribeAgent(setAgent), [])

  return agent
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
