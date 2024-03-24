import { CandidAdapter } from "@ic-reactor/core/dist/classes"
import { AgentContext } from "../../types"
import { useAgentManager } from "./useAgentManager"
import { useEffect, useState } from "react"
import { createCandidAdapter } from "@ic-reactor/core"

export interface UseCandidAdapterParams {
  agentContext?: React.Context<AgentContext | null>
  didjsCanisterId?: string
}
/**
 * Accesses the `AgentManager` instance for managing agent configurations and state.
 *
 * @example
 *```jsx
 *  function AgentManagerComponent() {
 *    const agentManager = useAgentManager();
 *
 *    // Use agentManager for managing agent configurations, etc.
 *    return <div>Agent Manager ready.</div>;
 *  }
 *```
 */
export const useCandidAdapter = (config: UseCandidAdapterParams) => {
  const [candidAdapter, setCandidAdapter] = useState<CandidAdapter>()

  const agentManager = useAgentManager(config.agentContext)

  useEffect(() => {
    const agent = agentManager.getAgent()
    try {
      const candidManager = createCandidAdapter({
        agent,
        didjsCanisterId: config.didjsCanisterId,
      })
      setCandidAdapter(candidManager)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error creating CandidAdapter", error)
    }
  }, [agentManager, config.didjsCanisterId])

  return candidAdapter
}
