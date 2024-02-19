import { useContext } from "react"
import { AgentManager } from "@ic-reactor/core/dist/agent"
import { AgentContext } from "./context"
import type { AgentContextType } from "./types"
import { AuthArgs } from "../../types"

export const useAgentManagerContext = (agentContext?: AgentContextType) => {
  const context = useContext(agentContext || AgentContext)

  if (!context) {
    throw new Error("Agent context must be used within a AgentProvider")
  }

  return context
}

export const useAgentManager = (
  agentContext?: AgentContextType
): AgentManager => {
  const context = useAgentManagerContext(agentContext)

  return context.agentManager
}

export const useAgent = (agentContext?: AgentContextType) =>
  useAgentManagerContext(agentContext).useAgent()

export const useAuthStore = (agentContext?: AgentContextType) =>
  useAgentManagerContext(agentContext).useAuthStore()

export const useAgentState = (agentContext?: AgentContextType) =>
  useAgentManagerContext(agentContext).useAgentState()

export const useAuthClient = ({
  agentContext,
  ...args
}: AuthArgs & { agentContext?: AgentContextType }) => {
  const context = useAgentManagerContext(agentContext)

  return context.useAuthClient(args)
}

export const useUserPrincipal = (agentContext?: AgentContextType) =>
  useAgentManagerContext(agentContext).useUserPrincipal()
