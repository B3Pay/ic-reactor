import React from "react"
import { useAgentManager } from "../agent"
import { createCandidAdapter } from "@ic-reactor/core"

import type {
  CandidAdapterContextType,
  CreateCandidAdapterContextParameters,
  CreateCandidAdapterContextReturnType,
  CandidAdapterProviderProps,
  UseCandidEvaluationReturnType,
} from "./types"

export function createAdapterContext(
  config: CreateCandidAdapterContextParameters = {}
): CreateCandidAdapterContextReturnType {
  const {
    withParser: _withParser,
    didjsCanisterId: _didjsCanisterId,
    ...defaultConfig
  } = config

  const CandidAdapterContext =
    React.createContext<CandidAdapterContextType | null>(null)

  const useCandidAdapter = () => {
    const context = React.useContext(CandidAdapterContext)

    if (!context) {
      throw new Error("Actor hooks must be used within a ActorProvider")
    }

    return context
  }

  const useCandidEvaluation = (): UseCandidEvaluationReturnType => {
    const [state, setState] = React.useState({
      fetching: true,
      isFetching: true,
      fetchError: null as string | null,
    })

    const candidAdapter = useCandidAdapter()

    const validateCandid = React.useCallback((candidString: string) => {
      setState({
        fetchError: null,
        fetching: false,
        isFetching: false,
      })
      try {
        return candidAdapter.validateIDL(candidString)
      } catch (err) {
        setState({
          fetchError: `Error validating Candid definition, ${err}`,
          fetching: false,
          isFetching: false,
        })
        return false
      }
    }, [])

    const isCandidValid = React.useCallback(
      (candidString: string) => {
        return validateCandid(candidString) !== false
      },
      [validateCandid]
    )

    const evaluateCandid = React.useCallback(async (candidString: string) => {
      setState({
        fetchError: null,
        fetching: true,
        isFetching: true,
      })
      try {
        const definition = await candidAdapter.evaluateCandidDefinition(
          candidString
        )
        if (typeof definition?.idlFactory !== "function") {
          throw new Error("No Function found in Candid definition!")
        }
        setState({
          fetchError: null,
          fetching: false,
          isFetching: false,
        })
        return definition.idlFactory
      } catch (err) {
        setState({
          fetchError: `Error evaluating Candid definition, ${err}`,
          fetching: false,
          isFetching: false,
        })
        return undefined
      }
    }, [])

    return { evaluateCandid, isCandidValid, validateCandid, ...state }
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
    CandidAdapterContext,
    CandidAdapterProvider,
    useCandidEvaluation,
    useCandidAdapter,
  }
}
