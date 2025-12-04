/* eslint-disable no-console */
import { AgentError, HttpAgent } from "@icp-sdk/core/agent"
import {
  createStoreWithOptionalDevtools,
  getNetworkByHostname,
  getProcessEnvNetwork,
} from "../../utils/helper"
import { AuthClient } from "@icp-sdk/auth/client"
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

const AGENT_INITIAL_STATE: AgentState = {
  initialized: false,
  isInitialized: false,
  initializing: false,
  isInitializing: false,
  error: undefined,
  network: undefined,
}

const AUTH_INITIAL_STATE: AuthState = {
  identity: null,
  authenticating: false,
  isAuthenticating: false,
  authenticated: false,
  isAuthenticated: false,
  error: undefined,
}

export class AgentManager {
  private _agent: HttpAgent
  private _auth: AuthClient | null = null
  private _subscribers: Array<(agent: HttpAgent) => void> = []

  public agentStore: AgentStore
  public authStore: AuthStore

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
      initializeOnCreate = true,
      ...agentOptions
    } = options || {}
    if (withProcessEnv) {
      const processNetwork = getProcessEnvNetwork()
      if (processNetwork === "ic") {
        agentOptions.host = IC_HOST_NETWORK_URI
      } else if (processNetwork === "local") {
        agentOptions.host =
          typeof process !== "undefined" && process.env.IC_HOST
            ? process.env.IC_HOST
            : `http://127.0.0.1:${port}`
      }
    } else if (withLocalEnv) {
      agentOptions.host = `http://127.0.0.1:${port}`
    } else {
      agentOptions.host = agentOptions.host ?? IC_HOST_NETWORK_URI
    }

    this.agentStore = createStoreWithOptionalDevtools(AGENT_INITIAL_STATE, {
      withDevtools,
      name: "reactor-agent",
      store: "agent",
    })

    this.authStore = createStoreWithOptionalDevtools(AUTH_INITIAL_STATE, {
      withDevtools,
      name: "reactor-agent",
      store: "auth",
    })

    this._agent = HttpAgent.createSync(agentOptions)

    if (initializeOnCreate) {
      this.initializeAgent()
    }
  }

  public initializeAgent = async () => {
    const network = this.getNetwork()
    this.updateAgentState(
      {
        initializing: true,
        isInitializing: true,
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
          {
            error: error as AgentError,
            initializing: false,
            isInitializing: false,
          },
          "error"
        )
      }
    }
    this.updateAgentState(
      {
        initialized: true,
        isInitialized: true,
        initializing: false,
        isInitializing: false,
      },
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
    this.updateAuthState(
      { isAuthenticating: true, authenticating: true },
      "authenticating"
    )

    try {
      this._auth = await AuthClient.create()
      const isAuthenticated = await this._auth.isAuthenticated()
      const identity = this._auth.getIdentity()

      this._agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateAuthState(
        {
          authenticated: isAuthenticated,
          isAuthenticated,
          identity,
          authenticating: false,
          isAuthenticating: false,
        },
        "authenticated"
      )

      return identity
    } catch (error) {
      this.updateAuthState(
        {
          error: error as Error,
          isAuthenticating: false,
          authenticating: false,
        },
        "error"
      )
      throw error
    }
  }

  public login = async (options?: AuthClientLoginOptions) => {
    this.updateAuthState(
      { isAuthenticating: true, authenticating: true },
      "login"
    )
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

  public isAuthClientInitialized = () => {
    return this.getAgentState().isInitialized && this._auth !== null
  }

  public getNetwork = () => {
    const hostname = this.getAgentHostName()

    return getNetworkByHostname(hostname)
  }

  public getAgentState: AgentStore["getState"] = () => {
    return this.agentStore.getState()
  }

  // @ts-expect-error: Overrides subscribe method signature
  public subscribeAgentState: AgentStore["subscribe"] = (
    selectorOrListener,
    listener,
    options
  ) => {
    if (listener) {
      return this.agentStore.subscribe(selectorOrListener, listener, options)
    }

    return this.agentStore.subscribe(selectorOrListener)
  }

  // auth store
  public getAuthState: AuthStore["getState"] = () => {
    return this.authStore.getState()
  }

  // @ts-expect-error: Overrides subscribe method signature
  public subscribeAuthState: AuthStore["subscribe"] = (
    selectorOrListener,
    listener,
    options
  ) => {
    if (listener) {
      return this.authStore.subscribe(selectorOrListener, listener, options)
    }

    return this.authStore.subscribe(selectorOrListener)
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
