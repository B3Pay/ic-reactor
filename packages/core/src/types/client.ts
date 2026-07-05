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
   * Force connecting to local replica.
   */
  withLocalEnv?: boolean
  /**
   * Local network port override.
   */
  port?: number
  /**
   * Optional configuration for the underlying HttpAgent.
   */
  agentOptions?: HttpAgentOptions
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
