import type { HttpAgent, HttpAgentOptions } from "@icp-sdk/core/agent"
import type { QueryClient } from "@tanstack/query-core"

/**
 * Parameters for configuring a ClientManager instance.
 *
 * @property {QueryClient} queryClient - The TanStack QueryClient used for caching and state management.
 * @property {number} [port] - The port used for the local IC replica (default is 4943).
 * @property {HttpAgentOptions} [agentOptions] - Optional configuration for the underlying HttpAgent.
 * @property {boolean} [withLocalEnv] - If true, configures the agent for a local environment.
 * @property {boolean} [withProcessEnv] - If not false, auto-configures the agent based on process.env settings (defaults to true).
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
   *
   * @deprecated Use agentOptions.host to specify a host directly or rely on process environment auto-detection (which is enabled by default).
   */
  port?: number
  /**
   * If true, configures the agent for a local environment.
   *
   * @deprecated Use agentOptions.host to specify a host directly or rely on process environment auto-detection (which is enabled by default).
   */
  withLocalEnv?: boolean
  /**
   * If not false, auto-configures the agent based on process.env settings (defaults to true).
   *
   * @deprecated Process environment auto-detection is enabled by default. This parameter will be removed in future releases.
   */
  withProcessEnv?: boolean
  /**
   * If true, uses the canister environment from `@icp-sdk/core/agent/canister-env`
   * to configure the agent from the `ic_env` cookie.
   *
   * `ic_env` is read automatically in the browser when present. Pass `false`
   * to opt out of automatic ICP CLI environment detection.
   *
   * @deprecated Automatic detection is enabled by default when `ic_env` exists.
   */
  withCanisterEnv?: boolean
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
