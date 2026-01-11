import type { Identity } from "@icp-sdk/core/agent"
import type { AuthClient, AuthClientLoginOptions } from "@icp-sdk/auth/client"
import type {
  ClientManagerParameters,
  AgentState,
  AuthState,
} from "./types/client"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryClient } from "@tanstack/react-query"

import { HttpAgent } from "@icp-sdk/core/agent"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import {
  IC_HOST_NETWORK_URI,
  IC_INTERNET_IDENTITY_PROVIDER,
  LOCAL_INTERNET_IDENTITY_PROVIDER,
} from "./utils/constants"
import { getNetworkByHostname, getProcessEnvNetwork } from "./utils/helper"

/**
 * ClientManager is a central class for managing the Internet Computer (IC) agent and authentication state.
 *
 * It initializes the agent (connecting to local or mainnet), handles authentication via AuthClient,
 * and integrates with TanStack Query's QueryClient for state management.
 *
 * @example
 * ```typescript
 * import { ClientManager } from "@ic-reactor/core";
 * import { QueryClient } from "@tanstack/react-query";
 *
 * const queryClient = new QueryClient();
 * const clientManager = new ClientManager({
 *   queryClient,
 *   withLocalEnv: true, // Use local replica
 * });
 *
 * await clientManager.initialize();
 * ```
 */
export class ClientManager {
  #agent: HttpAgent
  #authClient?: AuthClient
  #identitySubscribers: Array<(identity: Identity) => void> = []
  #agentStateSubscribers: Array<(state: AgentState) => void> = []
  #authStateSubscribers: Array<(state: AuthState) => void> = []
  #targetCanisterIds: Set<string> = new Set()

  /**
   * The TanStack QueryClient used for managing cached canister data and invalidating queries on identity changes.
   */
  public queryClient: QueryClient
  /**
   * Current state of the HttpAgent, including initialization status, network, and error information.
   */
  public agentState: AgentState
  /**
   * Current authentication state, including the active identity, authentication progress, and errors.
   */
  public authState: AuthState

  private initPromise?: Promise<void>
  private authPromise?: Promise<Identity | undefined>

  /**
   * Creates a new instance of ClientManager.
   *
   * @param parameters - Configuration options for the agent and network environment.
   */
  constructor({
    port = 4943,
    withLocalEnv,
    withProcessEnv,
    withCanisterEnv,
    agentOptions = {},
    queryClient,
    authClient,
  }: ClientManagerParameters) {
    this.queryClient = queryClient

    this.agentState = {
      isInitialized: false,
      isInitializing: false,
      error: undefined,
      network: undefined,
      isLocalhost: false,
    }

    this.authState = {
      identity: null,
      isAuthenticating: false,
      isAuthenticated: false,
      error: undefined,
    }

    // EXPERIMENTAL: Use canister environment from ic_env cookie when enabled
    // ⚠️ This may cause issues with update calls on localhost development
    if (withCanisterEnv) {
      const canisterEnv =
        typeof window !== "undefined" ? safeGetCanisterEnv() : undefined
      const isDev =
        typeof import.meta !== "undefined" && (import.meta as any).env?.DEV

      if (isDev && typeof window !== "undefined") {
        agentOptions.host = agentOptions.host ?? window.location.origin
        agentOptions.verifyQuerySignatures =
          agentOptions.verifyQuerySignatures ?? false
      } else {
        agentOptions.verifyQuerySignatures =
          agentOptions.verifyQuerySignatures ?? true
      }

      if (canisterEnv?.IC_ROOT_KEY) {
        agentOptions.rootKey = agentOptions.rootKey ?? canisterEnv.IC_ROOT_KEY
      }
    }

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
    } else if (!withCanisterEnv) {
      // Only set default host if withCanisterEnv hasn't already configured it
      agentOptions.host = agentOptions.host ?? IC_HOST_NETWORK_URI
    }

    this.#agent = HttpAgent.createSync(agentOptions)
    this.updateAgentState({ isLocalhost: this.isLocal })

    if (authClient) {
      this.#authClient = authClient
      const identity = this.#authClient.getIdentity()
      this.updateAgent(identity)
      this.authState = {
        identity,
        isAuthenticated: !identity.getPrincipal().isAnonymous(),
        isAuthenticating: false,
        error: undefined,
      }
    }
  }

  /**
   * Orchestrates the complete initialization of the ClientManager.
   * This method awaits the agent's core initialization (e.g., fetching root keys)
   * and triggers the authentication (session restoration) in the background.
   *
   * @returns A promise that resolves to the ClientManager instance when core initialization is complete.
   */
  public async initialize() {
    await this.initializeAgent()
    this.authenticate()
    return this
  }

  /**
   * Specifically initializes the HttpAgent.
   * On local networks, this includes fetching the root key for certificate verification.
   *
   * @returns A promise that resolves when the agent is fully initialized.
   */
  public async initializeAgent() {
    if (this.agentState.isInitialized) {
      return
    }
    if (this.agentState.isInitializing) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      this.updateAgentState({ isInitializing: true })
      if (typeof window !== "undefined") {
        console.info(
          `%cic-reactor:%c Initializing agent for ${this.network} network`,
          "color: #3b82f6; font-weight: bold",
          "color: inherit",
          {
            host: this.agentHost?.toString(),
            isLocal: this.isLocal,
          }
        )
      }
      try {
        if (this.isLocal) {
          await this.#agent.fetchRootKey()
        }
        this.updateAgentState({ isInitialized: true, isInitializing: false })
      } catch (error) {
        this.updateAgentState({
          error: error as Error,
          isInitializing: false,
        })
        this.initPromise = undefined
        throw error
      }
    })()

    return this.initPromise
  }

  private authModuleMissing = false

  /**
   * Attempts to initialize the authentication client and restore a previous session.
   *
   * If an `AuthClient` is already initialized (passed in constructor or previously created),
   * it uses that instance. Otherwise, it dynamically imports the `@icp-sdk/auth` module
   * and creates a new AuthClient.
   *
   * If the module is missing and no client is provided, it fails gracefully by marking authentication as unavailable.
   *
   * @returns A promise that resolves to the restored Identity, or undefined if auth fails or is unavailable.
   */
  public authenticate = async (): Promise<Identity | undefined> => {
    if (this.authState.isAuthenticated) {
      return this.authState.identity || undefined
    }
    if (this.authPromise) {
      return this.authPromise
    }

    if (this.authModuleMissing) {
      return undefined
    }

    this.authPromise = (async () => {
      if (typeof window !== "undefined") {
        console.info(
          `%cic-reactor:%c Authenticating...`,
          "color: #3b82f6; font-weight: bold",
          "color: inherit",
          {
            network: this.network,
            authClient: this.#authClient ? "Shared Instance" : "Dynamic Import",
          }
        )
      }
      this.updateAuthState({ isAuthenticating: true })
      try {
        if (!this.#authClient) {
          const authModule = await import("@icp-sdk/auth/client").catch(() => {
            this.authModuleMissing = true
            return null
          })

          if (!authModule) {
            this.authModuleMissing = true
            this.updateAuthState({ isAuthenticating: false })
            return undefined
          }

          const { AuthClient } = authModule
          this.#authClient = await AuthClient.create()
        }
        const identity = this.#authClient.getIdentity()
        this.updateAgent(identity)
        this.updateAuthState({
          identity,
          isAuthenticated: !identity.getPrincipal().isAnonymous(),
          isAuthenticating: false,
        })
        return identity
      } catch (error) {
        this.updateAuthState({ error: error as Error, isAuthenticating: false })
        console.error("Authentication failed:", error)
        throw error
      } finally {
        this.authPromise = undefined
      }
    })()

    return this.authPromise
  }

  /**
   * Triggers the login flow using the Internet Identity provider.
   *
   * @param loginOptions - Options for the login flow, including identity provider and callbacks.
   * @throws An error if the authentication module is not installed.
   */
  public login = async (loginOptions?: AuthClientLoginOptions) => {
    try {
      // Ensure agent is initialized before login
      if (!this.agentState.isInitialized) {
        await this.initializeAgent()
      }

      if (!this.#authClient) {
        await this.authenticate()
      }

      if (!this.#authClient) {
        throw new Error(
          "Authentication module is missing or failed to initialize. To use login, please install the auth package: npm install @icp-sdk/auth"
        )
      }

      this.updateAuthState({ isAuthenticating: true, error: undefined })

      // Auto-detect identity provider based on network if not provided
      const identityProvider =
        loginOptions?.identityProvider || this.getDefaultIdentityProvider()

      await this.#authClient.login({
        ...loginOptions,
        identityProvider,
        onSuccess: () => {
          const identity = this.#authClient!.getIdentity()
          if (identity) {
            this.updateAgent(identity)
            this.updateAuthState({
              identity,
              isAuthenticated: true,
              isAuthenticating: false,
            })
          }
          ;(loginOptions?.onSuccess as any)?.()
        },
        onError: (error) => {
          this.updateAuthState({
            error: new Error(error),
            isAuthenticating: false,
          })
          loginOptions?.onError?.(error)
        },
      })
    } catch (error) {
      this.updateAuthState({
        error: error as Error,
        isAuthenticating: false,
      })
      throw error
    }
  }

  /**
   * Logs out the user and reverts the agent to an anonymous identity.
   *
   * @throws An error if the authentication module is not installed.
   */
  public logout = async () => {
    if (!this.#authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To use logout, please install the auth package: npm install @icp-sdk/auth"
      )
    }
    this.updateAuthState({ isAuthenticating: true, error: undefined })
    await this.#authClient.logout()
    const identity = this.#authClient.getIdentity()
    if (identity) {
      this.updateAgent(identity)
      this.updateAuthState({
        identity,
        isAuthenticated: false,
        isAuthenticating: false,
      })
    }
  }

  /**
   * The underlying HttpAgent managed by this class.
   */
  get agent() {
    return this.#agent
  }

  /**
   * The host URL of the current IC agent.
   */
  get agentHost(): URL | undefined {
    return this.#agent.host
  }

  /**
   * The hostname of the current IC agent.
   */
  get agentHostName() {
    return this.agentHost?.hostname || ""
  }

  /**
   * Returns true if the agent is connecting to a local environment.
   */
  get isLocal() {
    return this.network !== "ic"
  }

  /**
   * Returns the current network type ('ic' or 'local').
   */
  get network() {
    const hostname = this.agentHostName
    return getNetworkByHostname(hostname)
  }

  /**
   * Returns the current user's Principal identity.
   */
  public getUserPrincipal() {
    return this.#agent.getPrincipal()
  }

  /**
   * Registers a canister ID that this agent will interact with.
   * This is used for informational purposes and network detection.
   */
  public registerCanisterId(canisterId: string, name?: string): void {
    if (typeof window !== "undefined") {
      const actorName = name || canisterId
      console.info(
        `%cic-reactor:%c Adding actor ${actorName}`,
        "color: #3b82f6; font-weight: bold",
        "color: inherit",
        {
          network: this.network,
          canisterId,
          ...(name && { name }),
        }
      )
    }
    this.#targetCanisterIds.add(canisterId)
  }

  /**
   * Returns a list of all canister IDs registered with this agent.
   */
  public connectedCanisterIds(): string[] {
    return Array.from(this.#targetCanisterIds)
  }

  /**
   * Get the subnet ID for a canister.
   */
  public getSubnetIdFromCanister(canisterId: string) {
    return this.#agent.getSubnetIdFromCanister(canisterId)
  }

  /**
   * Sync time with a specific subnet.
   */
  public syncTimeWithSubnet(subnetId: Principal) {
    return this.#agent.syncTimeWithSubnet(subnetId)
  }

  private getDefaultIdentityProvider(): string {
    if (this.isLocal) {
      return LOCAL_INTERNET_IDENTITY_PROVIDER
    } else {
      return IC_INTERNET_IDENTITY_PROVIDER
    }
  }

  /**
   * Subscribes to identity changes (e.g., after login/logout).
   * @param callback - Function called with the new identity.
   * @returns An unsubscribe function.
   */
  public subscribe(callback: (identity: Identity) => void) {
    this.#identitySubscribers.push(callback)
    return () => {
      this.#identitySubscribers = this.#identitySubscribers.filter(
        (sub) => sub !== callback
      )
    }
  }

  /**
   * Subscribes to changes in the agent's initialization state.
   * @param callback - Function called with the updated agent state.
   * @returns An unsubscribe function.
   */
  public subscribeAgentState(callback: (state: AgentState) => void) {
    this.#agentStateSubscribers.push(callback)
    return () => {
      this.#agentStateSubscribers = this.#agentStateSubscribers.filter(
        (sub) => sub !== callback
      )
    }
  }

  /**
   * Subscribes to changes in the authentication state.
   * @param callback - Function called with the updated authentication state.
   * @returns An unsubscribe function.
   */
  public subscribeAuthState(callback: (state: AuthState) => void) {
    this.#authStateSubscribers.push(callback)
    return () => {
      this.#authStateSubscribers = this.#authStateSubscribers.filter(
        (sub) => sub !== callback
      )
    }
  }

  /**
   * Replaces the current agent's identity and invalidates TanStack queries.
   * @param identity - The new identity to use.
   */
  public updateAgent(identity: Identity) {
    if (typeof window !== "undefined") {
      console.info(
        `%cic-reactor:%c Updating agent identity`,
        "color: #3b82f6; font-weight: bold",
        "color: inherit",
        {
          principal: identity.getPrincipal().toText(),
        }
      )
    }
    // Cancel all queries for connected canisters to prevent race conditions
    // with the old identity
    this.connectedCanisterIds().forEach((canisterId) => {
      this.queryClient.cancelQueries({
        queryKey: [canisterId],
      })
    })

    this.#agent.replaceIdentity(identity)
    this.notifySubscribers(identity)
    this.queryClient.invalidateQueries()
  }

  private notifySubscribers(identity: Identity) {
    this.#identitySubscribers.forEach((sub) => sub(identity))
  }

  private notifyAgentStateSubscribers(state: AgentState) {
    this.#agentStateSubscribers.forEach((sub) => sub(state))
  }

  private notifyAuthStateSubscribers(state: AuthState) {
    this.#authStateSubscribers.forEach((sub) => sub(state))
  }

  private updateAgentState(newState: Partial<AgentState>) {
    this.agentState = { ...this.agentState, ...newState }
    this.notifyAgentStateSubscribers(this.agentState)
  }

  private updateAuthState(newState: Partial<AuthState>) {
    console.debug("Updating Auth State:", newState)
    this.authState = { ...this.authState, ...newState }
    this.notifyAuthStateSubscribers(this.authState)
  }
}
