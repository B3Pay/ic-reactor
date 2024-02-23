import { HttpAgent } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../../utils/helper"
import type {
  AgentState,
  AgentStore,
  AgentManagerParameters,
  UpdateAgentParameters,
  AuthState,
  AuthStore,
  AuthClient,
} from "./types"
import { IC_HOST_NETWORK_URI } from "../../utils/constants"

export class AgentManager {
  private _agent: HttpAgent
  private _auth: AuthClient | null = null
  private _subscribers: Array<(agent: HttpAgent) => void> = []

  public agentStore: AgentStore
  public authStore: AuthStore
  public withLocalEnv: boolean

  private initialAgentState: AgentState = {
    initialized: false,
    initializing: false,
    error: undefined,
  }

  private initialAuthState: AuthState = {
    identity: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  private updateAgentState = (newState: Partial<AgentState>) => {
    this.agentStore.setState((state) => ({ ...state, ...newState }))
  }

  private updateAuthState = (newState: Partial<AuthState>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor(options?: AgentManagerParameters) {
    const {
      withDevtools,
      port = 4943,
      withLocalEnv,
      host: optionHost,
      ...agentParameters
    } = options || {}
    const host = withLocalEnv
      ? `http://127.0.0.1:${port}`
      : optionHost
      ? optionHost.includes("localhost")
        ? optionHost.replace("localhost", "127.0.0.1")
        : optionHost
      : IC_HOST_NETWORK_URI

    this.agentStore = createStoreWithOptionalDevtools(this.initialAgentState, {
      withDevtools,
      store: "agent",
    })

    this.authStore = createStoreWithOptionalDevtools(this.initialAuthState, {
      withDevtools,
      store: "auth",
    })

    this._agent = new HttpAgent({ ...agentParameters, host })
    this.withLocalEnv = this._agent.isLocal()
    this.initializeAgent()
  }

  private initializeAgent = async () => {
    this.updateAgentState({ initializing: true })
    if (this.withLocalEnv) {
      try {
        await this._agent.fetchRootKey()
        this.updateAgentState({ initialized: true, initializing: false })
      } catch (error) {
        this.updateAgentState({ error: error as Error, initializing: false })
      }
    }
  }

  public subscribeAgent = (
    callback: (agent: HttpAgent) => void,
    initialize = true
  ) => {
    if (initialize) {
      callback(this._agent)
    }
    this._subscribers.push(callback)
    return () => this.unsubscribeAgent(callback)
  }

  public unsubscribeAgent = (callback: (agent: HttpAgent) => void) => {
    this._subscribers = this._subscribers.filter((sub) => sub !== callback)
  }

  private notifySubscribers = () => {
    this._subscribers.forEach((callback) => callback(this._agent))
  }

  public updateAgent = async (options?: UpdateAgentParameters) => {
    const { agent } = options || {}

    if (agent) {
      this._agent = agent
    } else if (options) {
      this._agent = new HttpAgent(options)
      this.withLocalEnv = this._agent.isLocal()
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

      this._auth = await AuthClient.create()
      const authenticated = await this._auth.isAuthenticated()

      const identity = this._auth.getIdentity()

      this._agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateAuthState({
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

  public getAgentState: AgentStore["getState"] = () => {
    return this.agentStore.getState()
  }

  public subscribeAgentState: AgentStore["subscribe"] = (listener) => {
    return this.agentStore.subscribe(listener)
  }

  // auth store
  public getAuthState: AuthStore["getState"] = () => {
    return this.authStore.getState()
  }

  public subscribeAuthState: AuthStore["subscribe"] = (listener) => {
    return this.authStore.subscribe(listener)
  }

  public getAuth = () => {
    return this._auth
  }

  public getIdentity = () => {
    return this.authStore.getState().identity
  }

  public getPrincipal = () => {
    const identity = this.authStore.getState().identity
    return identity ? identity.getPrincipal() : null
  }
}
