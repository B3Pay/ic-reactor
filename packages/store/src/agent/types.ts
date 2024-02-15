import type { HttpAgent, HttpAgentOptions, Identity } from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { StoreApi } from "zustand"

export { HttpAgentOptions, AuthClient, Identity }

export interface AgentManagerOptions extends HttpAgentOptions {
  port?: number
  isLocalEnv?: boolean
  withDevtools?: boolean
}

// Main state structure for a ReActor
export interface AgentAuthState {
  identity: Identity | null
  initialized: boolean
  initializing: boolean
  authClient: AuthClient | null
  authenticating: boolean
  authenticated: boolean
  error: Error | undefined
}

export interface UpdateAgentOptions extends HttpAgentOptions {
  agent?: HttpAgent
}

// Type for the ReActor store
export type AgentAuthStore = StoreApi<AgentAuthState>
