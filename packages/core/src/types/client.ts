import type { HttpAgent, HttpAgentOptions } from "@icp-sdk/core/agent"
import type { QueryClient } from "@tanstack/query-core"

/**
 * Parameters for configuring a ClientManager instance.
 *
 * @property {QueryClient} queryClient - The TanStack QueryClient used for caching and state management.
 * @property {HttpAgentOptions} [agentOptions] - Optional configuration for the underlying HttpAgent.
 */
export interface ClientManagerParameters {
  /**
   * The TanStack QueryClient used for caching and state management.
   */
  queryClient: QueryClient
  /**
   * Optional configuration for the underlying HttpAgent.
   */
  agentOptions?: HttpAgentOptions
  /**
   * Whether to trust the configuration carried by the `ic_env` cookie.
   *
   * Three values are read from that cookie, and this flag governs all of them:
   * the agent root key certificate verification is checked against, the
   * Internet Identity provider, and the canister ID a reactor resolves by name
   * when none is configured.
   *
   * Defaults to `true` only for hosts that are unambiguously a local replica
   * (loopback, `localhost`, and the dev-container domains that tunnel one).
   * Cookies are not origin-isolated — any sibling subdomain of the registrable
   * domain can write `ic_env` — so every other host must opt in. Set this when
   * you run a custom testnet on a real domain and trust its `ic_env`.
   */
  allowEnvConfig?: boolean
  /**
   * @deprecated Renamed to {@link allowEnvConfig}. The flag governs every value
   * read from the `ic_env` cookie rather than the root key alone, and the old
   * name understated what opting in accepts. This spelling still works, and is
   * used when `allowEnvConfig` is not set.
   */
  allowEnvRootKey?: boolean
}

/**
 * Represents the state of an agent.
 */
export interface AgentState {
  /**
   * Indicates whether the agent has been initialized.
   */
  isInitialized: boolean

  /**
   * Indicates whether the agent is in the process of initializing.
   */
  isInitializing: boolean

  /**
   * Represents an error associated with the agent, if any.
   */
  error: Error | undefined

  /**
   * Represents the network associated with the agent, if any.
   */
  network: string | undefined

  /**
   * Indicates whether the agent is connected to a local network.
   */
  isLocalhost: boolean
}

export interface UpdateAgentParameters extends HttpAgentOptions {
  agent?: HttpAgent
}
