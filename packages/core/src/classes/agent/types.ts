import type { HttpAgent, HttpAgentOptions, Identity } from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { StoreApiWithDevtools } from "../../types"

export { HttpAgentOptions, AuthClient, Identity }

export interface AgentManagerParameters extends HttpAgentOptions {
  port?: number
  withLocalEnv?: boolean
  withDevtools?: boolean
  withProcessEnv?: boolean
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

// Type for the Reactor store
export type AgentStore = StoreApiWithDevtools<AgentState>
export type AuthStore = StoreApiWithDevtools<AuthState>
