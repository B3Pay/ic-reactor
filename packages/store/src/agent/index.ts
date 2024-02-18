import { HttpAgent } from "@dfinity/agent"
import { createStoreWithOptionalDevtools } from "../tools/helper"
import type {
  AgentAuthState,
  AgentAuthStore,
  AgentManagerOptions,
  UpdateAgentOptions,
} from "./types"

export * from "./types"

export const IC_HOST_NETWORK_URI = "https://ic0.app"
export const LOCAL_HOST_NETWORK_URI = "http://127.0.0.1:4943"

export class AgentManager {
  private agent: HttpAgent
  private subscribers: Array<(agent: HttpAgent) => void> = []

  public authStore: AgentAuthStore
  public isLocalEnv: boolean

  private DEFAULT_AUTH_STATE: AgentAuthState = {
    identity: null,
    initialized: false,
    initializing: false,
    authClient: null,
    authenticating: false,
    authenticated: false,
    error: undefined,
  }

  private updateState = (newState: Partial<AgentAuthState>) => {
    this.authStore.setState((state) => ({ ...state, ...newState }))
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

    this.authStore = createStoreWithOptionalDevtools(this.DEFAULT_AUTH_STATE, {
      withDevtools,
      store: "auth",
    })

    this.agent = new HttpAgent({ ...agentOptions, host })
    this.isLocalEnv = this.agent.isLocal()
    this.initializeAgent()
  }

  private initializeAgent = async () => {
    this.updateState({ initializing: true })
    if (this.isLocalEnv) {
      try {
        await this.agent.fetchRootKey()
        this.updateState({ initialized: true, initializing: false })
      } catch (error) {
        this.updateState({ error: error as Error, initializing: false })
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
      this.isLocalEnv = this.agent.isLocal()
      await this.initializeAgent()
    }

    this.notifySubscribers()
  }

  public authenticate = async () => {
    this.updateState({ authenticating: true })

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

      this.agent.replaceIdentity(identity)
      this.notifySubscribers()

      this.updateState({
        authClient,
        authenticated,
        identity,
        authenticating: false,
      })

      return identity
    } catch (error) {
      this.updateState({ error: error as Error, authenticating: false })
      throw error
    }
  }

  public getAgent = () => {
    return this.agent
  }
}
