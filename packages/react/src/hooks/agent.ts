import type { AgentManager, HttpAgent } from "@ic-reactor/core"
import { useEffect, useState } from "react"
import { useStore } from "zustand"

export type AgentHooks = ReturnType<typeof getAgentHooks>

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
