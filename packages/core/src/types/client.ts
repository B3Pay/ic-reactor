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
   * Whether to adopt the agent root key from the `ic_env` cookie.
   *
   * Defaults to `true` only for hosts that are unambiguously a local replica
   * (loopback, `localhost`, and the dev-container domains that tunnel one).
   * The root key is what certificate verification is checked against, and
   * cookies are not origin-isolated, so any other host must opt in — set this
   * when you run a custom testnet on a real domain and trust its `ic_env`.
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
