import React from "react"
import { CandidAdapterProviderProps } from "../context/types"
import { createCandidAdapter } from "@ic-reactor/core"
import { CandidAdapterContext } from "../context/adapter"
import { useAgentManager } from "../hooks"

/**
 * `CandidAdapterProvider` is a React component that provides the CandidAdapter to its children.
 * It initializes the CandidAdapter with the provided options and makes it available to all children.
 *
 * @example
 * ```tsx
 * import { AgentProvider, CandidAdapterProvider, ActorProvider } from "@ic-reactor/react"
 *
 * const App = () => (
 *  <AgentProvider>
 *    <CandidAdapterProvider>
 *       Your Actors here, it will able to fetch the Candid interface
 *       you dont need to pass the idlFactory to the Actor component
 *       e.g.
 *      <ActorProvider canisterId="ryjl3-tyaaa-aaaaa-aaaba-cai" />
 *    </CandidAdapterProvider>
 *  </AgentProvider>
 * )
 *
 * export default App
 * ```
 */
const CandidAdapterProvider: React.FC<CandidAdapterProviderProps> = ({
  children,
  withParser,
  loadingComponent = <div>Loading Parser...</div>,
  didjsCanisterId,
  ...options
}) => {
  const [initalized, setInitialized] = React.useState(false)

  const agentManager = useAgentManager()

  const candidAdapter = React.useMemo(
    () => createCandidAdapter({ agentManager, didjsCanisterId, ...options }),
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

CandidAdapterProvider.displayName = "CandidAdapterContext"

export { CandidAdapterProvider }
