import { createActorManager, createCandidAdapter } from "@ic-reactor/core"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useAgentManager } from "../provider/agent"
import { BaseActor } from "../types"
import { UseReactorOptions, UseReactorReturn, UseReactorState } from "./types"
import { getActorHooks } from "../helpers"

/**
 * A comprehensive hook that manages both the fetching of Candid interfaces
 * and the initialization of actor stores for Internet Computer (IC) canisters.
 * It simplifies the process of interacting with canisters by encapsulating
 * the logic for Candid retrieval and actor store management.
 *
 * @example
 * ```tsx
 * import React from 'react';
 * import { useReactor } from '@ic-reactor/react';
 * import { IDL } from '@dfinity/candid';
 *
 * const App = () => {
 *   const { actorManager, fetchCandid, candid, fetching, fetchError } = useReactor({
 *     canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai',
 *   });
 *
 *   return (
 *     <div>
 *       <h2>IC Canister Interaction</h2>
 *       {fetching && <p>Loading Candid interface...</p>}
 *       {fetchError && <p>Error: {fetchError}</p>}
 *       {candid.idlFactory && (
 *         <div>
 *           <p>Candid interface fetched successfully.</p>
 *           <pre>{JSON.stringify(candid.idlFactory({ IDL }), null, 2)}</pre>
 *         </div>
 *       )}
 *       <button onClick={fetchCandid} disabled={fetching}>
 *         {fetching ? 'Fetching...' : 'Fetch Candid'}
 *       </button>
 *     </div>
 *   );
 * };
 *
 * export default App;
 * ```
 */
export const useReactor = <A = BaseActor>({
  canisterId,
  agentContext,
  idlFactory: maybeIdlFactory,
  didjsCanisterId,
  ...config
}: UseReactorOptions): UseReactorReturn<A> => {
  const [{ idlFactory, fetching, fetchError }, setState] =
    useState<UseReactorState>({
      idlFactory: maybeIdlFactory,
      fetching: false,
      fetchError: null,
    })

  const agentManager = useAgentManager(agentContext)

  const fetchCandid = useCallback(async () => {
    if (!canisterId) return

    setState({
      idlFactory: undefined,
      fetching: true,
      fetchError: null,
    })

    try {
      const candidManager = createCandidAdapter({
        agentManager,
        didjsCanisterId,
      })
      const { idlFactory } = await candidManager.getCandidDefinition(canisterId)

      setState({
        idlFactory,
        fetching: false,
        fetchError: null,
      })

      return idlFactory
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      setState({
        idlFactory: undefined,
        fetchError: `Error fetching canister ${canisterId}`,
        fetching: false,
      })
    }
  }, [canisterId, didjsCanisterId, agentManager])

  // Automatically fetch Candid if not already fetched or provided.
  useEffect(() => {
    if (!fetching && !idlFactory) {
      fetchCandid()
    }
  }, [fetchCandid])

  const hooks = useMemo(() => {
    if (!idlFactory) return null

    const actorManager = createActorManager<A>({
      agentManager,
      idlFactory,
      canisterId,
      ...config,
    })

    return getActorHooks(actorManager)
  }, [idlFactory])

  return { hooks, fetching, fetchError }
}
