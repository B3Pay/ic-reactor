import type { HttpAgent, HttpAgentOptions, Identity } from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { QueryClient } from "@tanstack/query-core"
import type { QueryClientConfig } from "../query"

export { HttpAgentOptions, AuthClient, Identity }

export interface AgentManagerParameters extends HttpAgentOptions {
  port?: number
  withLocalEnv?: boolean
  withProcessEnv?: boolean
  /**
   * Provide a custom QueryClient instance
   * If not provided, a new one will be created
   */
  queryClient?: QueryClient
  /**
   * Configuration for the QueryClient (only used if queryClient is not provided)
   */
  queryClientConfig?: QueryClientConfig
}

export interface AgentState {
  initialized: boolean
  initializing: boolean
  error: Error | undefined
  network: string
}

export interface AuthState {
  identity: Identity | null
  authenticating: boolean
  authenticated: boolean
  error: Error | undefined
}

export interface UpdateAgentParameters extends HttpAgentOptions {
  agent?: HttpAgent
}
