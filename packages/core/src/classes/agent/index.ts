/* eslint-disable no-console */
import { HttpAgent } from "@dfinity/agent"
import {
  getNetworkByHostname,
  getProcessEnvNetwork,
} from "../../utils/helper"
import { AuthClient } from "@dfinity/auth-client"
import type { AuthClientLoginOptions } from "../../types"
import type {
  AgentState,
  AgentManagerParameters,
  UpdateAgentParameters,
  AuthState,
} from "./types"
import {
  IC_HOST_NETWORK_URI,
  IC_INTERNET_IDENTITY_PROVIDER,
  LOCAL_INTERNET_IDENTITY_PROVIDER,
} from "../../utils/constants"
import type { QueryClient } from "@tanstack/query-core"
import { createQueryClient, agentKeys } from "../query"

export class AgentManager {
  private _agent: HttpAgent
  private _auth: AuthClient | null = null
  private _subscribers: Array<(agent: HttpAgent) => void> = []
  private _queryClient: QueryClient

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
    const queryKey = agentKeys.state()
    const currentState = this._queryClient.getQueryData<AgentState>(queryKey) || this.initialAgentState
    this._queryClient.setQueryData(queryKey, { ...currentState, ...newState })
    
    if (action) {
      console.debug(`[AgentManager] ${action}`, newState)
    }
  }

  private updateAuthState = (newState: Partial<AuthState>, action?: string) => {
    const queryKey = agentKeys.auth()
    const currentState = this._queryClient.getQueryData<AuthState>(queryKey) || this.initialAuthState
    this._queryClient.setQueryData(queryKey, { ...currentState, ...newState })
    
    if (action) {
      console.debug(`[AgentManager] ${action}`, newState)
    }
  }

  constructor(options?: AgentManagerParameters) {
    const {
      port = 4943,
      withLocalEnv,
      withProcessEnv,
      queryClient,
      queryClientConfig,
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

    // Initialize TanStack Query
    this._queryClient = queryClient || createQueryClient(queryClientConfig)
    
    // Initialize states in query cache
    this._queryClient.setQueryData(agentKeys.state(), this.initialAgentState)
    this._queryClient.setQueryData(agentKeys.auth(), this.initialAuthState)

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

  public getAgentState = (): AgentState => {
    return this._queryClient.getQueryData<AgentState>(agentKeys.state()) || this.initialAgentState
  }

  public subscribeAgentState = (
    listener: (state: AgentState, previousState: AgentState) => void
  ): (() => void) => {
    const queryKey = agentKeys.state()
    return this._queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.query.queryKey &&
        JSON.stringify(event.query.queryKey) === JSON.stringify(queryKey)
      ) {
        listener(this.getAgentState(), this.getAgentState())
      }
    })
  }

  // auth store
  public getAuthState = (): AuthState => {
    return this._queryClient.getQueryData<AuthState>(agentKeys.auth()) || this.initialAuthState
  }

  public subscribeAuthState = (
    listener: (state: AuthState, previousState: AuthState) => void
  ): (() => void) => {
    const queryKey = agentKeys.auth()
    return this._queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.query.queryKey &&
        JSON.stringify(event.query.queryKey) === JSON.stringify(queryKey)
      ) {
        listener(this.getAuthState(), this.getAuthState())
      }
    })
  }

  public getAuth = () => {
    return this._auth
  }

  public getIdentity = () => {
    return this.getAuthState().identity
  }

  public getPrincipal = () => {
    const identity = this.getAuthState().identity
    return identity ? identity.getPrincipal() : null
  }

  /**
   * Get the QueryClient instance
   */
  public getQueryClient = (): QueryClient => {
    return this._queryClient
  }
}
