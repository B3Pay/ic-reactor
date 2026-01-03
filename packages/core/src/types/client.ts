import type { HttpAgent, HttpAgentOptions, Identity } from "@icp-sdk/core/agent"
import type { AuthClient } from "@icp-sdk/auth/client"
import type { QueryClient } from "@tanstack/query-core"

/**
 * Parameters for configuring a ClientManager instance.
 *
 * @property {QueryClient} queryClient - The TanStack QueryClient used for caching and state management.
 * @property {number} [port] - The port used for the local IC replica (default is 4943).
 * @property {HttpAgentOptions} [agentOptions] - Optional configuration for the underlying HttpAgent.
 * @property {boolean} [withLocalEnv] - If true, configures the agent for a local environment.
 * @property {boolean} [withProcessEnv] - If true, auto-configures the agent based on process.env settings.
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
   * The port used for the local IC replica (default is 4943).
   */
  port?: number
  /**
   * If true, configures the agent for a local environment.
   */
  withLocalEnv?: boolean
  /**
   * If true, auto-configures the agent based on process.env settings.
   */
  withProcessEnv?: boolean
  /**
   * Optional pre-initialized AuthClient instance.
   * If provided, the manager will use this instance instead of dynamically importing
   * and creating a new one from `@icp-sdk/auth`.
   * This is useful for environments where dynamic imports are not supported or
   * when you want to share an AuthClient instance across multiple managers.
   */
  authClient?: AuthClient
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

/**
 * Represents the authentication state of an agent.
 */
export interface AuthState {
  identity: Identity | null

  /**
   * Indicates whether the authentication process is ongoing.
   */
  isAuthenticating: boolean

  /**
   * Indicates whether the agent is authenticated.
   */
  isAuthenticated: boolean

  /**
   * Represents any error that occurred during authentication.
   */
  error: Error | undefined
}

export interface UpdateAgentParameters extends HttpAgentOptions {
  agent?: HttpAgent
}
