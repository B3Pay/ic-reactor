import type {
  AgentError,
  HttpAgent,
  HttpAgentOptions,
  Identity,
} from "@icp-sdk/core/agent"
import type { AuthClient } from "@icp-sdk/auth/client"
import type { StoreWithAllMiddleware } from "../../types"

export { HttpAgentOptions, AuthClient, Identity }

/**
 * Parameters for configuring an AgentManager instance.
 * Extends the options available in `HttpAgentOptions`.
 *
 * @extends HttpAgentOptions
 *
 * @property {number} [port] - The port number to be used by the agent.
 * @property {boolean} [withLocalEnv] - Whether to include local environment variables.
 * @property {boolean} [withDevtools] - Whether to enable developer tools integration.
 * @property {boolean} [withProcessEnv] - Whether to include process environment variables.
 * @property {boolean} [initializeOnCreate] - Whether to initialize the agent upon creation.
 */
export interface AgentManagerParameters extends HttpAgentOptions {
  port?: number
  withLocalEnv?: boolean
  withDevtools?: boolean
  withProcessEnv?: boolean
  initializeOnCreate?: boolean
}

/**
 * Represents the state of an agent.
 */
export interface AgentState {
  /**
   * @deprecated Use `isInitialized` instead.
   * Indicates whether the agent has been initialized.
   */
  initialized: boolean

  /**
   * Indicates whether the agent has been initialized.
   */
  isInitialized: boolean

  /**
   * @deprecated Use `isInitializing` instead.
   * Indicates whether the agent is in the process of initializing.
   */
  initializing: boolean

  /**
   * Indicates whether the agent is in the process of initializing.
   */
  isInitializing: boolean

  /**
   * Represents an error associated with the agent, if any.
   */
  error: AgentError | undefined

  /**
   * Represents the network associated with the agent, if any.
   */
  network: string | undefined
}

/**
 * Represents the authentication state of an agent.
 */
export interface AuthState {
  identity: Identity | null

  /**
   * @deprecated Use `isAuthenticating` instead.
   * Indicates whether the authentication process is ongoing.
   */
  authenticating: boolean

  /**
   * Indicates whether the authentication process is ongoing.
   */
  isAuthenticating: boolean

  /**
   * @deprecated Use `isAuthenticated` instead.
   * Indicates whether the agent is authenticated.
   */
  authenticated: boolean

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

// Type for the Reactor store
export type AgentStore = StoreWithAllMiddleware<AgentState>
export type AuthStore = StoreWithAllMiddleware<AuthState>
