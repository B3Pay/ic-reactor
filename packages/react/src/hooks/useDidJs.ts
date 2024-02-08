import { useState, useCallback, useEffect } from "react"
import { CandidManager } from "@ic-reactor/store"
import type { IDL } from "@dfinity/candid"
import { useAgent } from "../context/agent"

interface IDLFactoryState {
  didJs: {
    idlFactory: IDL.InterfaceFactory | undefined
    init: ({ IDL }: { IDL: any }) => never[]
  }
  fetching: boolean
  fetchError: string | null
}

const DEFAULT_STATE: IDLFactoryState = {
  didJs: { idlFactory: undefined, init: () => [] },
  fetching: false,
  fetchError: null,
}

interface UseIDLFactoryArgs {
  canisterId: string
  didjsId?: string
  idlFactory?: IDL.InterfaceFactory
}

const useDidJs = ({ canisterId, didjsId, idlFactory }: UseIDLFactoryArgs) => {
  const [{ didJs, fetchError, fetching }, setDidJs] = useState<IDLFactoryState>(
    {
      ...DEFAULT_STATE,
      didJs: {
        idlFactory,
        init: () => [],
      },
    }
  )

  const agent = useAgent()

  const fetchDidJs = useCallback(async () => {
    if (!canisterId || !agent) return
    setDidJs((prevState) => ({
      ...prevState,
      didJs: DEFAULT_STATE.didJs,
      fetching: true,
      fetchError: null,
    }))

    try {
      const candidManager = new CandidManager(agent, didjsId)
      let fetchedDidJs = await candidManager
        .getFromMetadata(canisterId)
        .catch(() => null)

      if (!fetchedDidJs) {
        fetchedDidJs = await candidManager
          .getFromTmpHack(canisterId)
          .catch(() => null)
      }

      if (fetchedDidJs) {
        setDidJs({
          didJs: fetchedDidJs,
          fetching: false,
          fetchError: null,
        })
      } else {
        setDidJs((prevState) => ({
          ...prevState,
          fetchError: `Candid not found for canister ${canisterId}`,
          fetching: false,
        }))
      }

      return fetchedDidJs
    } catch (err) {
      console.error(err)
      setDidJs((prevState) => ({
        ...prevState,
        fetchError: `Error fetching canister ${canisterId}`,
        fetching: false,
      }))
    }
  }, [canisterId, didjsId, agent])

  useEffect(() => {
    if (!fetching) {
      fetchDidJs()
    }
  }, [fetchDidJs])

  return { fetchDidJs, didJs, fetching, fetchError }
}

export default useDidJs
