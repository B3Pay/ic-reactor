import { useState, useCallback, useEffect } from "react"
import { CandidManager } from "@ic-reactor/store"
import type { IDL } from "@dfinity/candid"
import { useAgentManager } from "../context/agent"

interface UseIDLFactory {
  idlFactory?: IDL.InterfaceFactory
  fetching: boolean
  fetchError: string | null
}

interface DidJs {
  idlFactory?: IDL.InterfaceFactory
}

/**
 * useIDLFactory Hook
 *
 * Description:
 * The `useIDLFactory` hook is used to fetch the Interface Definition Language (IDL) factory for a specific canister.
 * It uses the `CandidManager` to fetch the IDL factory from the metadata of the canister or from a temporary hack if the metadata fetch fails.
 *
 * Parameters:
 * @param {string} canisterId - The ID of the canister for which the IDL factory is to be fetched.
 * @param {string} [didjsCanisterId] - The ID of the didjs canister. This is optional and if not provided, the default didjs canister ID is used.
 * @param {IDL.InterfaceFactory} [maybeIdlFactory] - An optional IDL factory. If provided, this will be used instead of fetching a new one.
 *
 * Returns:
 * @returns {object} An object containing the following properties:
 *  - idlFactory (IDL.InterfaceFactory): The fetched IDL factory.
 *  - fetching (boolean): A boolean indicating whether the fetch operation is ongoing.
 *  - fetchError (string | null): Any error that occurred during the fetch operation. If no error occurred, this will be `null`.
 *
 * Usage:
 * This hook is used in the context of the DFINITY Internet Computer where canisters are the fundamental unit of computation.
 * It is used when you need to interact with a canister's methods and need the IDL factory to do so.
 */
const useIDLFactory = (
  canisterId: string,
  didjsCanisterId?: string,
  maybeIdlFactory?: IDL.InterfaceFactory
): UseIDLFactory => {
  const agentManager = useAgentManager()

  const [{ idlFactory }, setDidJs] = useState<DidJs>({
    idlFactory: maybeIdlFactory,
  })
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchDidJs = useCallback(async () => {
    if (!canisterId) return
    setFetching(true)
    setFetchError(null)

    try {
      const agent = agentManager.getAgent()
      const candidManager = new CandidManager(agent, didjsCanisterId)
      let fetchedDidJs = await candidManager
        .getFromMetadata(canisterId)
        .catch(() => null)

      if (!fetchedDidJs) {
        fetchedDidJs = await candidManager
          .getFromTmpHack(canisterId)
          .catch(() => null)
      }

      if (fetchedDidJs) {
        setDidJs(fetchedDidJs)
      } else {
        setFetchError(`Candid not found for canister ${canisterId}`)
      }
    } catch (err) {
      console.error(err)
      setFetchError(`Error fetching canister ${canisterId}`)
    } finally {
      setFetching(false)
    }
  }, [canisterId, didjsCanisterId, agentManager])

  useEffect(() => {
    if (idlFactory === undefined && !fetching) {
      fetchDidJs()
    }
  }, [fetchDidJs])

  return { idlFactory, fetching, fetchError }
}

export default useIDLFactory
