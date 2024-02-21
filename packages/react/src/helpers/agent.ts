import type { AgentManager } from "@ic-reactor/core/dist/agent"
import type { HttpAgent } from "@ic-reactor/core/dist/types"
import type { AgentHooks } from "./types"
import { useEffect, useState } from "react"
import { useStore } from "zustand"

export const getAgentHooks = (agentManager: AgentManager): AgentHooks => {
  const { agentStore, getAgent, subscribeAgent } = agentManager

  const useAgentState = () => useStore(agentStore)

  const useAgent = (): HttpAgent | undefined => {
    const [agent, setAgent] = useState<HttpAgent | undefined>(getAgent)

    useEffect(() => subscribeAgent(setAgent), [subscribeAgent])

    return agent
  }

  return {
    useAgent,
    useAgentState,
  }
}
