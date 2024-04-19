import { CandidAdapter } from "@ic-reactor/core/dist/classes"
import { useEffect, useState } from "react"
import { createCandidAdapter } from "@ic-reactor/core"
import { useAgent } from "./useAgent"

export interface UseCandidAdapterParams {
  didjsCanisterId?: string
}
/**
 * Accesses the `CandidAdapter` to download the actor's Candid interface.
 *
 * @param config - `UseCandidAdapterParams` The configuration object.
 * @returns The `CandidAdapter` instance.
 *
 * @example
 * ```jsx
 * function CandidAdapterComponent() {
 *   const candidAdapter = useCandidAdapter();
 *
 *   const getActor = async () => {
 *      const { idlFactory } = await candidAdapter.getCandidDefinition(canisterId)
 *      console.log(idlFactory)
 *   }
 *
 *   return (
 *       <button onClick={getActor}>Get Actor</button>
 *   );
 * }
 *```
 */
export const useCandidAdapter = (config: UseCandidAdapterParams = {}) => {
  const [candidAdapter, setCandidAdapter] = useState<CandidAdapter>()

  const agent = useAgent()

  useEffect(() => {
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
  }, [agent, config.didjsCanisterId])

  return candidAdapter
}
