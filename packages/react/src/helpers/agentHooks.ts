import React from "react"
import { useStore } from "zustand"

import type { HttpAgent, AgentManager } from "@ic-reactor/core/dist/types"
import type { AgentHooksReturnType } from "./types"

export const agentHooks = (
  agentManager: AgentManager
): AgentHooksReturnType => {
  const { agentStore, getAgent, subscribeAgent } = agentManager

  const useAgentState = () => useStore(agentStore)

  const useAgent = (): HttpAgent | undefined => {
    const [agent, setAgent] = React.useState<HttpAgent | undefined>(getAgent)

    React.useEffect(() => subscribeAgent(setAgent), [subscribeAgent])

    return agent
  }

  return {
    useAgent,
    useAgentState,
  }
}
