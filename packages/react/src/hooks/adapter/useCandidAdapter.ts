import React from "react"
import { CandidAdapterContext } from "../../context/adapter"

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
export const useCandidAdapter = () => {
  const candidAdapter = React.useContext(CandidAdapterContext)

  return candidAdapter
}
