import { useState, useCallback, useEffect } from "react"
import { createCandidAdapter } from "@ic-reactor/core"
import type { IDL } from "@dfinity/candid"
import { useAgent } from "../provider/agent"

interface IDLFactoryState {
  candid: {
    idlFactory?: IDL.InterfaceFactory
    init: ({ idl }: { idl: typeof IDL }) => never[]
  }
  fetching: boolean
  fetchError: string | null
}

const DEFAULT_STATE: IDLFactoryState = {
  candid: { idlFactory: undefined, init: () => [] },
  fetching: false,
  fetchError: null,
}

interface UseIDLFactoryArgs {
  canisterId: string
  didjsCanisterId?: string
  idlFactory?: IDL.InterfaceFactory
}

export const useCandid = ({
  canisterId,
  didjsCanisterId,
  idlFactory,
}: UseIDLFactoryArgs) => {
  const [{ candid, fetchError, fetching }, setCandid] =
    useState<IDLFactoryState>({
      ...DEFAULT_STATE,
      candid: {
        idlFactory,
        init: () => [],
      },
    })

  const agent = useAgent()

  const fetchCandid = useCallback(async () => {
    if (!canisterId || !agent) return
    setCandid((prevState) => ({
      ...prevState,
      candid: DEFAULT_STATE.candid,
      fetching: true,
      fetchError: null,
    }))

    try {
      const candidManager = createCandidAdapter({ agent, didjsCanisterId })

      const fetchedCandid = await candidManager.getCandidDefinition(canisterId)

      setCandid({
        candid: fetchedCandid,
        fetching: false,
        fetchError: null,
      })

      return fetchedCandid
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      setCandid((prevState) => ({
        ...prevState,
        fetchError: `Error fetching canister ${canisterId}`,
        fetching: false,
      }))
    }
  }, [canisterId, didjsCanisterId, agent])

  useEffect(() => {
    if (!fetching && !idlFactory) {
      fetchCandid()
    }
  }, [fetchCandid])

  return { fetchCandid, candid, fetching, fetchError }
}
