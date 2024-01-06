import type { HttpAgent, HttpAgentOptions, Identity } from "@dfinity/agent"
import type { AuthClient } from "@dfinity/auth-client"
import type { StoreApi } from "zustand"

export { HttpAgentOptions, AuthClient, Identity }

export interface AgentManagerOptions extends HttpAgentOptions {
  isLocal?: boolean
  withDevtools?: boolean
}

// Main state structure for a ReActor
export interface ActorAuthState {
  identity: Identity | null
  authClient: AuthClient | null
  authenticating: boolean
  authenticated: boolean
  error: Error | undefined
}

// Type for the ReActor store
export type AuthenticateStore = StoreApi<ActorAuthState>

// Actions available on a ReActor
export interface AgentActions {
  getAgent: () => HttpAgent
  updateAgent: (agent: HttpAgent) => void
  authStore: AuthenticateStore
  authenticate: () => Promise<void>
  subscribeAgent: (callback: (agent: HttpAgent) => void) => () => void
  unsubscribeAgent: (callback: (agent: HttpAgent) => void) => void
}
