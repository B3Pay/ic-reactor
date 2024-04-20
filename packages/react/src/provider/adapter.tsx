import React from "react"
import { CandidAdapterProviderProps } from "../context/types"
import { createCandidAdapter } from "@ic-reactor/core"
import { CandidAdapterContext } from "../context/adapter"
import { useAgentManager } from "../hooks"

/**
 * `CandidAdapterProvider` is a React functional component that serves as a context provider for IC agent and authentication hooks.
 * It enables any child components to access and use the agent and authentication functionalities seamlessly.
 *
 * The provider encapsulates the logic for initializing and managing an agent manager instance, which is then used to
 * create various hooks related to agent operations and authentication processes. These hooks are made available to all
 * child components through the context, facilitating a centralized and efficient way to interact with the Internet Computer (IC) blockchain.
 *
 * @param children - Child components that can consume the context.
 * @param agentManager - An optional `AgentManager` instance to be used by the provider. If not provided, a new instance
 *                       will be created based on the provided options combined with default configuration.
 * @param options - Configuration options for the `AgentManager`. These options are merged with any default configurations
 *                  specified during the context creation and can include custom settings for the agent, such as identity,
 *                  host URL, etc.
 *
 * @example
 * Wrap your component tree with `CandidAdapterProvider` to provide all child components access to IC agent and authentication hooks.
 *
 * ```jsx
 * <CandidAdapterProvider>
 *   <YourComponent />
 * </CandidAdapterProvider>
 * ```
 *
 * Inside `YourComponent` or any of its children, you can use the hooks provided through the context to interact with the IC,
 * manage authentication, and perform other agent-related tasks.
 */
const CandidAdapterProvider: React.FC<CandidAdapterProviderProps> = ({
  children,
  initialParser,
  loadingComponent = <div>Awaiting Candid interface...</div>,
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
    if (initialParser) {
      candidAdapter.initializeParser().then(() => setInitialized(true))
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
