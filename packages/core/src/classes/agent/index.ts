/* eslint-disable no-console */
import { HttpAgent } from "@dfinity/agent"
import {
  createStoreWithOptionalDevtools,
  getNetworkByHostname,
  getProcessEnvNetwork,
} from "../../utils/helper"
import { AuthClient } from "@dfinity/auth-client"
import type { AuthClientLoginOptions } from "../../types"
import type {
  AgentState,
  AgentStore,
  AgentManagerParameters,
  UpdateAgentParameters,
  AuthState,
  AuthStore,
} from "./types"
import {
  IC_HOST_NETWORK_URI,
  IC_INTERNET_IDENTITY_PROVIDER,
  LOCAL_INTERNET_IDENTITY_PROVIDER,
} from "../../utils/constants"

export class AgentManager {
  private _agent: HttpAgent
  private _auth: AuthClient | null = null
  private _subscribers: Array<(agent: HttpAgent) => void> = []

  public agentStore: AgentStore
  public authStore: AuthStore

  private initialAgentState: AgentState = {
    initialized: false,
    initializing: false,
    error: undefined,
    network: "ic",
  }

  private initialAuthState: AuthState = {
    identity: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  private updateAgentState = (
    newState: Partial<AgentState>,
    action?: string
  ) => {
    this.agentStore.setState(
      (state) => ({ ...state, ...newState }),
      false,
      action
    )
  }

  private updateAuthState = (newState: Partial<AuthState>, action?: string) => {
    this.authStore.setState(
      (state) => ({ ...state, ...newState }),
      false,
      action
    )
  }

  constructor(options?: AgentManagerParameters) {
    const {
      withDevtools,
      port = 4943,
      withLocalEnv,
      withProcessEnv,
      ...agentOptions
    } = options || {}
    if (withProcessEnv) {
      const processNetwork = getProcessEnvNetwork()
      agentOptions.host =
        processNetwork === "ic" ? IC_HOST_NETWORK_URI : undefined
    } else if (withLocalEnv) {
      agentOptions.host = `http://127.0.0.1:${port}`
    } else {
      agentOptions.host = agentOptions.host ?? IC_HOST_NETWORK_URI
    }

    this.agentStore = createStoreWithOptionalDevtools(this.initialAgentState, {
      withDevtools,
      name: "reactor-agent",
      store: "agent",
    })

    this.authStore = createStoreWithOptionalDevtools(this.initialAuthState, {
      withDevtools,
      name: "reactor-agent",
      store: "auth",
    })

    this._agent = HttpAgent.createSync(agentOptions)
    this.initializeAgent()
  }

  private initializeAgent = async () => {
    const network = this.getNetwork()
    this.updateAgentState(
      {
        initializing: true,
        error: undefined,
        network,
      },
      "initializing"
    )
    if (network !== "ic") {
      try {
        await this._agent.fetchRootKey()
      } catch (error) {
        this.updateAgentState(
          { error: error as Error, initializing: false },
          "error"
        )
      }
    }
    this.updateAgentState(
      { initialized: true, initializing: false },
      "initialized"
    )
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

  private notifySubscribers = async () => {
    await Promise.all(
      this._subscribers.map(async (callback) => callback(this._agent))
    )
  }

  public updateAgent = async (options?: UpdateAgentParameters) => {
    const { agent } = options || {}

    if (agent) {
      this._agent = agent
    } else if (options) {
      this._agent = HttpAgent.createSync(options)
      await this.initializeAgent()
    }

    await this.notifySubscribers()
  }

  public authenticate = async () => {
    console.log(`Authenticating on ${this.getNetwork()} network`)
    this.updateAuthState({ authenticating: true }, "authenticating")

    try {
      this._auth = await AuthClient.create()
      const authenticated = await this._auth.isAuthenticated()
      const identity = this._auth.getIdentity()

      this._agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateAuthState(
        {
          authenticated,
          identity,
          authenticating: false,
        },
        "authenticated"
      )

      return identity
    } catch (error) {
      this.updateAuthState(
        { error: error as Error, authenticating: false },
        "error"
      )
      throw error
    }
  }

  public login = async (options?: AuthClientLoginOptions) => {
    this.updateAuthState({ authenticating: true }, "login")
    if (!this._auth) {
      await this.authenticate()
    }

    if (!this._auth) {
      throw new Error("Auth client not initialized")
    }
    await this._auth.login({
      identityProvider: this.getIsLocal()
        ? LOCAL_INTERNET_IDENTITY_PROVIDER
        : IC_INTERNET_IDENTITY_PROVIDER,
      ...options,
      onSuccess: async (msg) => {
        await this.authenticate()
        options?.onSuccess?.(msg)
      },
    })
  }

  public logout = async (options?: { returnTo?: string }) => {
    if (!this._auth) {
      throw new Error("Auth client not initialized")
    }
    await this._auth.logout(options)
    await this.authenticate()
  }

  // agent store
  public getAgent = () => {
    return this._agent
  }

  public getAgentHost = (): URL | undefined => {
    return this._agent.host
  }

  public getAgentHostName = () => {
    return this.getAgentHost()?.hostname || ""
  }

  public getIsLocal = () => {
    return this.getNetwork() !== "ic"
  }

  public getNetwork = () => {
    const hostname = this.getAgentHostName()

    return getNetworkByHostname(hostname)
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
