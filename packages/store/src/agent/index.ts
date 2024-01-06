import { HttpAgent } from "@dfinity/agent"
import { AuthClient } from "@dfinity/auth-client"
import { ReActorAuthState, ReActorAuthStore } from "../types"
import { createStoreWithOptionalDevtools } from "../helper"
import { ReActorAgentOptions } from "./types"

class AgentManager {
  private agent: HttpAgent
  private subscribers: Array<(agent: HttpAgent) => void> = []

  public authStore: ReActorAuthStore

  private DEFAULT_AUTH_STATE: ReActorAuthState = {
    identity: null,
    authClient: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  private updateAuthState = (newState: Partial<ReActorAuthState>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
  }

  constructor({ withDevtools, ...options }: ReActorAgentOptions) {
    this.authStore = createStoreWithOptionalDevtools(this.DEFAULT_AUTH_STATE, {
      withDevtools,
      store: "auth",
    })

    this.agent = new HttpAgent(options)
    this.initializeAgent()
  }

  private initializeAgent = async () => {
    if (this.agent.isLocal()) {
      try {
        await this.agent.fetchRootKey()
      } catch (error) {
        console.error("Error fetching root key:", error)
      }
    }
  }

  public subscribe = (callback: (agent: HttpAgent) => void) => {
    this.subscribers.push(callback)
    return () => this.unsubscribe(callback)
  }

  private unsubscribe = (callback: (agent: HttpAgent) => void) => {
    this.subscribers = this.subscribers.filter((sub) => sub !== callback)
  }

  private notifySubscribers = () => {
    this.subscribers.forEach((callback) => callback(this.agent))
  }

  public updateAgent = (agent: HttpAgent) => {
    this.agent = agent
    this.notifySubscribers()
  }

  public authenticate = async () => {
    this.updateAuthState({ authenticating: true })

    try {
      const authClient = await AuthClient.create()
      const authenticated = await authClient.isAuthenticated()

      const identity = authClient.getIdentity()

      this.agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateAuthState({
        authClient,
        authenticated,
        identity,
        authenticating: false,
      })
    } catch (error) {
      this.updateAuthState({ error: error as Error, authenticating: false })

      console.error("Error in authenticate:", error)
    }
  }

  public getAgent = () => {
    return this.agent
  }
}

export default AgentManager
