import { useContext } from "react"
import { AgentManager } from "@ic-reactor/core/dist/agent"
import { AgentContext } from "./context"
import type { AgentContextType } from "./types"
import { UseAuthClientArgs } from "../../types"

export const useAgentContext = (agentContext?: AgentContextType) => {
  const context = useContext(agentContext || AgentContext)

  if (!context) {
    throw new Error("Agent context must be used within a AgentProvider")
  }

  return context
}

export const useAgentManager = (
  agentContext?: AgentContextType
): AgentManager => {
  const context = useAgentContext(agentContext)

  return context.agentManager
}

export const useAgent = (agentContext?: AgentContextType) =>
  useAgentContext(agentContext).useAgent()

export const useAuthState = (agentContext?: AgentContextType) =>
  useAgentContext(agentContext).useAuthState()

export const useAgentState = (agentContext?: AgentContextType) =>
  useAgentContext(agentContext).useAgentState()

export const useAuthClient = ({
  agentContext,
  ...args
}: UseAuthClientArgs & { agentContext?: AgentContextType }) => {
  const context = useAgentContext(agentContext)

  return context.useAuthClient(args)
}

export const useUserPrincipal = (agentContext?: AgentContextType) =>
  useAgentContext(agentContext).useUserPrincipal()
