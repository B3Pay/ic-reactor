import type { HttpAgent, HttpAgentOptions, Identity } from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { StoreApi } from "zustand"

export { HttpAgentOptions, AuthClient, Identity }

export interface AgentManagerParameters extends HttpAgentOptions {
  port?: number
  withLocalEnv?: boolean
  withDevtools?: boolean
}

export interface AgentState {
  initialized: boolean
  initializing: boolean
  error: Error | undefined
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
export type AgentStore = StoreApi<AgentState>
export type AuthStore = StoreApi<AuthState>