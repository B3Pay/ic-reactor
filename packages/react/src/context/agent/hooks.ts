import { useState, useEffect } from "react"
import { AgentManager, HttpAgent } from "@ic-reactor/core"
import { AgentContextType } from "./types"
import { useAgentManagerContext } from "."

export const useAgentManager = (
  agentContext?: AgentContextType
): AgentManager => {
  const context = useAgentManagerContext(agentContext)

  return context.agentManager
}

export const useAgentContext = (
  agentContext?: AgentContextType
): HttpAgent | undefined => {
  const agentManager = useAgentManager(agentContext)

  const [agent, setAgent] = useState<HttpAgent | undefined>(
    agentManager.getAgent()
  )

  useEffect(() => agentManager.subscribeAgent(setAgent), [])

  return agent
}
