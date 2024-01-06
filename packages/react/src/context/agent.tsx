import React, {
  createContext,
  PropsWithChildren,
  useMemo,
  useRef,
  useContext,
} from "react"
import {
  AgentManager,
  AgentManagerOptions,
  createAgentManager,
} from "@ic-reactor/store"
import { getAuthHooks } from "../hooks/auth"

export type AgentContextType = ReturnType<typeof getAuthHooks> & {
  agentManager: AgentManager
}

export const AgentContext = createContext<AgentContextType | null>(null)

export const useAgent = (): AgentContextType => {
  const context = useContext(AgentContext)

  if (!context) {
    throw new Error("useAgent must be used within a AgentProvider")
  }

  return context
}

export const useAgentManager = (): AgentManager => {
  const context = useContext(AgentContext)

  if (!context) {
    throw new Error("useAgentManager must be used within a AgentProvider")
  }

  return context.agentManager
}

interface ReActorProviderProps extends PropsWithChildren, AgentManagerOptions {
  agentManager?: AgentManager
}

export const AgentProvider: React.FC<ReActorProviderProps> = ({
  children,
  ...config
}) => {
  const agentManager = useRef(config.agentManager || createAgentManager(config))

  const hooks = useMemo(() => {
    const hooks = getAuthHooks(agentManager.current)
    return { ...hooks, agentManager: agentManager.current }
  }, [])

  return <AgentContext.Provider value={hooks}>{children}</AgentContext.Provider>
}
