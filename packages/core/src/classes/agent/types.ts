import type { HttpAgent, HttpAgentOptions, Identity } from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { StoreWithAllMiddleware } from "../../types"

export { HttpAgentOptions, AuthClient, Identity }

export interface AgentManagerParameters extends HttpAgentOptions {
  port?: number
  withLocalEnv?: boolean
  withDevtools?: boolean
  withProcessEnv?: boolean
  initializeOnCreate?: boolean
}

export interface AgentState {
  initialized: boolean
  initializing: boolean
  error: Error | undefined
  network: string | undefined
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

// Type for the Reactor store
export type AgentStore = StoreWithAllMiddleware<AgentState>
export type AuthStore = StoreWithAllMiddleware<AuthState>
