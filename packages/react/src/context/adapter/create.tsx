import React from "react"
import { useAgentManager } from "../agent"
import { createCandidAdapter } from "@ic-reactor/core"

import type {
  CandidAdapterContextType,
  CreateCandidAdapterCotextParameters,
  CreateCandidAdapterContextReturnType,
  CandidAdapterProviderProps,
  CandidAdapter,
} from "./types"

export function createAdapterContext(
  config: CreateCandidAdapterCotextParameters = {}
): CreateCandidAdapterContextReturnType {
  const {
    withParser: _withParser,
    didjsCanisterId: _didjsCanisterId,
    ...defaultConfig
  } = config

  const CandidAdapterContext =
    React.createContext<CandidAdapterContextType | null>(null)

  const useCandidAdapter = () => {
    const candidAdapter = React.useContext(CandidAdapterContext)

    return candidAdapter as CandidAdapter
  }

  const CandidAdapterProvider: React.FC<CandidAdapterProviderProps> = ({
    children,
    withParser = _withParser,
    loadingComponent = <div>Loading Parser...</div>,
    didjsCanisterId = _didjsCanisterId,
    ...restConfig
  }) => {
    const config = React.useMemo(
      () => ({
        ...defaultConfig,
        ...restConfig,
      }),
      [defaultConfig, restConfig]
    )

    const [initalized, setInitialized] = React.useState(false)

    const agentManager = useAgentManager()

    const candidAdapter = React.useMemo(
      () => createCandidAdapter({ agentManager, didjsCanisterId, ...config }),
      [didjsCanisterId, agentManager]
    )

    React.useEffect(() => {
      if (withParser) {
        candidAdapter.initializeParser().then(() => setInitialized(true))
      } else {
        setInitialized(true)
      }
    }, [])

    return (
      <CandidAdapterContext.Provider value={candidAdapter}>
        {initalized ? children : loadingComponent}
      </CandidAdapterContext.Provider>
    )
  }

  CandidAdapterProvider.displayName = "CandidAdapterProvider"

  return {
    useCandidAdapter,
    CandidAdapterProvider,
  }
}
