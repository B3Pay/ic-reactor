import { HttpAgent } from "@dfinity/agent"
import { AuthClient } from "@dfinity/auth-client"
import { createStoreWithOptionalDevtools } from "../helper"
import type {
  ActorAuthState,
  AuthenticateStore,
  AgentManagerOptions,
  UpdateAgentOptions,
} from "./types"

export * from "./types"

export class AgentManager {
  private agent: HttpAgent
  private subscribers: Array<(agent: HttpAgent) => void> = []

  public authStore: AuthenticateStore

  private DEFAULT_AUTH_STATE: ActorAuthState = {
    identity: null,
    initialized: false,
    initializing: false,
    authClient: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  private updateState = (newState: Partial<ActorAuthState>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor({ withDevtools, ...options }: AgentManagerOptions) {
    this.authStore = createStoreWithOptionalDevtools(this.DEFAULT_AUTH_STATE, {
      withDevtools,
      store: "auth",
    })

    this.agent = new HttpAgent(options)
    this.initializeAgent()
  }

  private initializeAgent = async () => {
    this.updateState({ initializing: true })
    if (this.agent.isLocal()) {
      try {
        await this.agent.fetchRootKey()
        this.updateState({ initialized: true, initializing: false })
      } catch (error) {
        this.updateState({ error: error as Error, initializing: false })
        console.error("Error fetching root key:", error)
      }
    }
  }

  public subscribeAgent = (callback: (agent: HttpAgent) => void) => {
    this.subscribers.push(callback)
    return () => this.unsubscribeAgent(callback)
  }

  public unsubscribeAgent = (callback: (agent: HttpAgent) => void) => {
    this.subscribers = this.subscribers.filter((sub) => sub !== callback)
  }

  private notifySubscribers = () => {
    this.subscribers.forEach((callback) => callback(this.agent))
  }

  public updateAgent = async (options?: UpdateAgentOptions) => {
    const { agent } = options || {}

    if (agent) {
      this.agent = agent
    } else if (options) {
      this.agent = new HttpAgent(options)
      await this.initializeAgent()
    }

    this.notifySubscribers()
  }

  public authenticate = async () => {
    this.updateState({ authenticating: true })

    try {
      const authClient = await AuthClient.create()
      const authenticated = await authClient.isAuthenticated()

      const identity = authClient.getIdentity()

      this.agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateState({
        authClient,
        authenticated,
        identity,
        authenticating: false,
      })
    } catch (error) {
      this.updateState({ error: error as Error, authenticating: false })

      console.error("Error in authenticate:", error)
    }
  }

  public getAgent = () => {
    return this.agent
  }
}
