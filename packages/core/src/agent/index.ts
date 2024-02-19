import { HttpAgent } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../tools/helper"
import type {
  AgentState,
  AgentStore,
  AgentManagerOptions,
  UpdateAgentOptions,
  AuthState,
  AuthStore,
} from "./types"

export * from "./types"

export const IC_HOST_NETWORK_URI = "https://ic0.app"
export const LOCAL_HOST_NETWORK_URI = "http://127.0.0.1:4943"

export class AgentManager {
  private _agentStore: AgentStore
  private _authStore: AuthStore
  private _agent: HttpAgent
  private _subscribers: Array<(agent: HttpAgent) => void> = []

  public isLocalEnv: boolean

  private initialAgentState: AgentState = {
    initialized: false,
    initializing: false,
    error: undefined,
  }

  private initialAuthState: AuthState = {
    identity: null,
    authClient: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  private updateAgentState = (newState: Partial<AgentState>) => {
    this._agentStore.setState((state) => ({ ...state, ...newState }))
  }

  private updateAuthState = (newState: Partial<AuthState>) => {
    this._authStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(options?: AgentManagerOptions) {
    const {
      withDevtools,
      port = 4943,
      isLocalEnv,
      host: optionHost,
      ...agentOptions
    } = options || {}
    const host = isLocalEnv
      ? `http://127.0.0.1:${port}`
      : optionHost
      ? optionHost.includes("localhost")
        ? optionHost.replace("localhost", "127.0.0.1")
        : optionHost
      : IC_HOST_NETWORK_URI

    this._agentStore = createStoreWithOptionalDevtools(this.initialAgentState, {
      withDevtools,
      store: "agent",
    })

    this._authStore = createStoreWithOptionalDevtools(this.initialAuthState, {
      withDevtools,
      store: "auth",
    })

    this._agent = new HttpAgent({ ...agentOptions, host })
    this.isLocalEnv = this._agent.isLocal()
    this.initializeAgent()
  }

  private initializeAgent = async () => {
    this.updateAgentState({ initializing: true })
    if (this.isLocalEnv) {
      try {
        await this._agent.fetchRootKey()
        this.updateAgentState({ initialized: true, initializing: false })
      } catch (error) {
        this.updateAgentState({ error: error as Error, initializing: false })
      }
    }
  }

  public subscribeAgent = (callback: (agent: HttpAgent) => void) => {
    this._subscribers.push(callback)
    return () => this.unsubscribeAgent(callback)
  }

  public unsubscribeAgent = (callback: (agent: HttpAgent) => void) => {
    this._subscribers = this._subscribers.filter((sub) => sub !== callback)
  }

  private notifySubscribers = () => {
    this._subscribers.forEach((callback) => callback(this._agent))
  }

  public updateAgent = async (options?: UpdateAgentOptions) => {
    const { agent } = options || {}

    if (agent) {
      this._agent = agent
    } else if (options) {
      this._agent = new HttpAgent(options)
      this.isLocalEnv = this._agent.isLocal()
      await this.initializeAgent()
    }

    this.notifySubscribers()
  }

  public authenticate = async () => {
    this.updateAuthState({ authenticating: true })

    try {
      const { AuthClient } = await import("@dfinity/auth-client").catch(
        (error) => {
          // eslint-disable-next-line no-console
          console.error("Failed to import @dfinity/auth-client:", error)
          throw new Error(
            "Authentication failed: @dfinity/auth-client package is missing."
          )
        }
      )

      const authClient = await AuthClient.create()
      const authenticated = await authClient.isAuthenticated()

      const identity = authClient.getIdentity()

      this._agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateAuthState({
        authClient,
        authenticated,
        identity,
        authenticating: false,
      })

      return identity
    } catch (error) {
      this.updateAuthState({ error: error as Error, authenticating: false })
      throw error
    }
  }

  // agent store
  public getAgent = () => {
    return this._agent
  }

  public getAgentStore = (): AgentStore => {
    return this._agentStore
  }

  public getAgentState: AgentStore["getState"] = () => {
    return this._agentStore.getState()
  }

  public subscribeAgentState: AgentStore["subscribe"] = (listener) => {
    return this._agentStore.subscribe(listener)
  }

  // auth store
  public getAuthStore = (): AuthStore => {
    return this._authStore
  }

  public getAuthState: AuthStore["getState"] = () => {
    return this._authStore.getState()
  }

  public subscribeAuthState: AuthStore["subscribe"] = (listener) => {
    return this._authStore.subscribe(listener)
  }

  public getAuthClient = () => {
    return this._authStore.getState().authClient
  }

  public getIdentity = () => {
    return this._authStore.getState().identity
  }

  public getPrincipal = () => {
    const identity = this._authStore.getState().identity
    return identity ? identity.getPrincipal() : null
  }
}
