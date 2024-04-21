import AdapterHooks from "../hooks/adapter/hooks"

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
export const CandidAdapterProvider = AdapterHooks.CandidAdapterProvider
