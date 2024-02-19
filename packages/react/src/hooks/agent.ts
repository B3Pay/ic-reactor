import type { AgentManager } from "@ic-reactor/core/dist/agent"
import type { HttpAgent } from "@ic-reactor/core/dist/types"
import { useEffect, useState } from "react"
import { useStore } from "zustand"

export const getAgentHooks = (agentManager: AgentManager) => {
  const { agentStore, getAgent } = agentManager

  const useAgentState = () => {
    return useStore(agentStore, (state) => state)
  }

  const useAgent = (): HttpAgent | undefined => {
    const [agent, setAgent] = useState<HttpAgent | undefined>(getAgent())

    useEffect(() => agentManager.subscribeAgent(setAgent), [])

    return agent
  }

  return {
    useAgent,
    useAgentState,
  }
}
