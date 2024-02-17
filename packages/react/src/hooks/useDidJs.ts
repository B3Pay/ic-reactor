import { useState, useCallback, useEffect } from "react"
import { createCandidAdapter } from "@ic-reactor/store"
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
  didjsCanisterId?: string
  idlFactory?: IDL.InterfaceFactory
}

const useDidJs = ({
  canisterId,
  didjsCanisterId,
  idlFactory,
}: UseIDLFactoryArgs) => {
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
      const candidManager = createCandidAdapter({ agent, didjsCanisterId })

      const fetchedDidJs = await candidManager.getCandidDefinition(canisterId)

      setDidJs({
        didJs: fetchedDidJs,
        fetching: false,
        fetchError: null,
      })

      return fetchedDidJs
    } catch (err) {
      console.error(err)
      setDidJs((prevState) => ({
        ...prevState,
        fetchError: `Error fetching canister ${canisterId}`,
        fetching: false,
      }))
    }
  }, [canisterId, didjsCanisterId, agent])

  useEffect(() => {
    if (!fetching && !idlFactory) {
      fetchDidJs()
    }
  }, [fetchDidJs])

  return { fetchDidJs, didJs, fetching, fetchError }
}

export default useDidJs
