import type { Identity } from "@icp-sdk/core/agent"
import type {
  ClientManagerParameters,
  AgentState,
  AuthState,
  AuthClientSignInOptions,
  AuthClientLike,
  ClientManagerAuthClientOptions,
  ClientManagerSignInOptions,
  IdentityAttributeResult,
  RequestIdentityAttributesParameters,
  RequestOpenIdIdentityAttributesParameters,
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
import {
  getNetworkByHostname,
  getProcessEnvNetwork,
  isDev,
} from "./utils/helper"
import {
  decodeIdentityAttributeValues,
  IDENTITY_ATTRIBUTES_BETA_PROVIDER,
  normalizeSignedIdentityAttributes,
  resolveIdentityAttributeKeys,
} from "./identity-attributes"

type AuthClientConstructor = {
  new (options?: ClientManagerAuthClientOptions): AuthClientLike
}

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
  #authClient?: AuthClientLike
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
  private authStateRevision = 0
  private authClientWasProvided = false
  private port: number
  private internetIdentityId?: string

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

    this.port = port

    // EXPERIMENTAL: Use canister environment from ic_env cookie when enabled
    // ⚠️ This may cause issues with update calls on localhost development
    if (withCanisterEnv) {
      const canisterEnv =
        typeof window !== "undefined" ? safeGetCanisterEnv() : undefined

      if (canisterEnv) {
        this.internetIdentityId =
          canisterEnv["internet_identity"] ||
          canisterEnv["PUBLIC_CANISTER_ID:internet_identity"] ||
          canisterEnv["CANISTER_ID_INTERNET_IDENTITY"]
      }

      if (isDev() && typeof window !== "undefined") {
        agentOptions.host = agentOptions.host ?? window.location.origin
        if (agentOptions.verifyQuerySignatures == null) {
          agentOptions.verifyQuerySignatures = false
          console.warn(
            "[ic-reactor] Query signature verification is DISABLED in development. " +
              "Never use withCanisterEnv in production without explicitly setting verifyQuerySignatures: true."
          )
        }
      } else {
        agentOptions.verifyQuerySignatures =
          agentOptions.verifyQuerySignatures ?? true
      }

      // Root key must NOT be sourced from the ic_env cookie: cookies are
      // user-controllable and accepting a root key from them would allow an
      // attacker to bypass all IC certificate verification.
      // If a custom root key is required (e.g. local replica), pass it via
      // agentOptions.rootKey in your application code instead.
      if (canisterEnv?.IC_ROOT_KEY) {
        console.error(
          "[ic-reactor] IC_ROOT_KEY in the ic_env cookie is ignored for security reasons. " +
            "Pass agentOptions.rootKey explicitly if you need a custom root key."
        )
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
    this.updateAgentState({
      isLocalhost: this.isLocal,
      network: this.network,
    })

    if (authClient) {
      this.authClientWasProvided = true
      this.#authClient = authClient
      this.syncAuthStateFromClient(this.authStateRevision).catch((error) => {
        this.updateAuthState({ error: error as Error, isAuthenticating: false })
      })
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
      if (isDev() && typeof window !== "undefined") {
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
      if (isDev() && typeof window !== "undefined") {
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
          const authClient = await this.initializeAuthClient()
          if (!authClient) {
            this.updateAuthState({ isAuthenticating: false })
            return undefined
          }
        }
        const identity = await this.#authClient!.getIdentity()
        const isAuthenticated = await this.#authClient!.isAuthenticated()
        this.updateAgent(identity)
        this.updateAuthState({
          identity,
          isAuthenticated,
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
  public login = async (loginOptions?: ClientManagerSignInOptions) => {
    let didCompleteSignIn = false

    try {
      // Ensure agent is initialized before login
      if (!this.agentState.isInitialized) {
        await this.initializeAgent()
      }

      const identityProvider =
        loginOptions?.identityProvider || this.getDefaultIdentityProvider()
      const authClientOptions = getAuthClientOptions({
        ...loginOptions,
        identityProvider,
      })

      if (
        !this.#authClient ||
        this.shouldRecreateAuthClient(authClientOptions)
      ) {
        await this.initializeAuthClient(authClientOptions)
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

      const identity = await this.#authClient.signIn(
        getSignInOptions(loginOptions)
      )
      this.updateAgent(identity)
      this.updateAuthState({
        identity,
        isAuthenticated: true,
        isAuthenticating: false,
      })
      didCompleteSignIn = true

      try {
        await (
          loginOptions?.onSuccess as (() => void | Promise<void>) | undefined
        )?.()
      } catch (callbackError) {
        this.updateAuthState({ error: callbackError as Error })
        await loginOptions?.onError?.((callbackError as Error).message)
        throw callbackError
      }
    } catch (error) {
      if (!didCompleteSignIn) {
        await loginOptions?.onError?.((error as Error).message)
        this.updateAuthState({
          error: error as Error,
          isAuthenticating: false,
        })
      }
      throw error
    }
  }

  /**
   * Logs out the user and reverts the agent to an anonymous identity.
   *
   * @throws An error if the authentication module is not installed.
   */
  public logout = async (options?: { returnTo?: string }) => {
    if (!this.#authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To use logout, please install the auth package: npm install @icp-sdk/auth"
      )
    }
    this.updateAuthState({ isAuthenticating: true, error: undefined })
    await this.#authClient.logout(options)
    const identity = await this.#authClient.getIdentity()
    this.updateAgent(identity)
    this.updateAuthState({
      identity,
      isAuthenticated: false,
      isAuthenticating: false,
    })
  }

  public requestIdentityAttributes = async ({
    keys,
    nonce,
    identityProvider = IDENTITY_ATTRIBUTES_BETA_PROVIDER,
    openIdProvider,
    windowOpenerFeatures,
    signIn = true,
    maxTimeToLive,
    targets,
  }: RequestIdentityAttributesParameters): Promise<IdentityAttributeResult> => {
    if (!this.agentState.isInitialized) {
      await this.initializeAgent()
    }

    const authClientOptions = getAuthClientOptions({
      identityProvider,
      windowOpenerFeatures,
      openIdProvider,
    })

    if (!this.#authClient || this.shouldRecreateAuthClient(authClientOptions)) {
      await this.initializeAuthClient(authClientOptions)
    }

    if (!this.#authClient) {
      await this.authenticate()
    }

    if (!this.#authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To request identity attributes, please install @icp-sdk/auth v6 or provide a compatible authClient."
      )
    }

    this.updateAuthState({ isAuthenticating: true, error: undefined })

    try {
      const requestPromise = this.#authClient.requestAttributes({
        keys,
        nonce,
      })
      const identityPromise = signIn
        ? this.#authClient.signIn({
            maxTimeToLive,
            targets,
          })
        : Promise.resolve(this.#authClient.getIdentity())

      const [signedAttributes, identity] = await Promise.all([
        requestPromise,
        identityPromise,
      ])

      const finalIdentity = identity ?? (await this.#authClient.getIdentity())
      const isAuthenticated = await this.#authClient.isAuthenticated()
      this.updateAgent(finalIdentity)
      this.updateAuthState({
        identity: finalIdentity,
        isAuthenticated,
        isAuthenticating: false,
      })

      const normalizedSignedAttributes =
        normalizeSignedIdentityAttributes(signedAttributes)

      return {
        principal: finalIdentity.getPrincipal().toText(),
        requestedKeys: keys,
        signedAttributes: normalizedSignedAttributes,
        decodedAttributes: decodeIdentityAttributeValues(
          normalizedSignedAttributes.data,
          keys
        ),
        completedAt: new Date().toISOString(),
      }
    } catch (error) {
      this.updateAuthState({ error: error as Error, isAuthenticating: false })
      throw error
    }
  }

  public requestOpenIdIdentityAttributes = async ({
    nonce,
    openIdProvider,
    keys,
    identityProvider = IDENTITY_ATTRIBUTES_BETA_PROVIDER,
    windowOpenerFeatures,
    signIn,
    maxTimeToLive,
    targets,
  }: RequestOpenIdIdentityAttributesParameters): Promise<IdentityAttributeResult> => {
    return this.requestIdentityAttributes({
      keys: await resolveIdentityAttributeKeys({ openIdProvider, keys }),
      nonce,
      identityProvider,
      openIdProvider,
      windowOpenerFeatures,
      signIn,
      maxTimeToLive,
      targets,
    })
  }

  /**
   * The underlying HttpAgent managed by this class.
   */
  get agent() {
    return this.#agent
  }

  /**
   * The AuthClient instance used for authentication, if available.
   */
  get authClient() {
    return this.#authClient
  }

  private async initializeAuthClient(
    options?: ClientManagerAuthClientOptions
  ): Promise<AuthClientLike | undefined> {
    const authModule = await import("@icp-sdk/auth/client").catch(() => {
      this.authModuleMissing = true
      return null
    })

    if (!authModule) {
      this.authModuleMissing = true
      return undefined
    }

    this.#authClient = this.createAuthClient(authModule, options)
    return this.#authClient
  }

  private createAuthClient(
    authModule: unknown,
    options?: ClientManagerAuthClientOptions
  ): AuthClientLike {
    const AuthClient = (authModule as { AuthClient?: AuthClientConstructor })
      .AuthClient

    if (!AuthClient) {
      throw new Error("@icp-sdk/auth/client did not export AuthClient")
    }

    return new AuthClient(options)
  }

  private shouldRecreateAuthClient(
    options?: ClientManagerAuthClientOptions
  ): boolean {
    return !this.authClientWasProvided && hasAuthClientOptions(options)
  }

  private async syncAuthStateFromClient(revision = this.authStateRevision) {
    if (!this.#authClient) {
      return
    }

    const identity = await this.#authClient.getIdentity()
    const isAuthenticated = await this.#authClient.isAuthenticated()
    if (revision !== this.authStateRevision) {
      return
    }
    this.updateAgent(identity)
    this.updateAuthState({
      identity,
      isAuthenticated,
      isAuthenticating: false,
      error: undefined,
    })
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
    if (isDev() && typeof window !== "undefined") {
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
      if (this.internetIdentityId) {
        return `http://${this.internetIdentityId}.localhost:${this.port}`
      }
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
    if (isDev() && typeof window !== "undefined") {
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
    if (isDev()) console.debug("[ic-reactor] Updating Auth State:", newState)
    this.authStateRevision += 1
    this.authState = { ...this.authState, ...newState }
    this.notifyAuthStateSubscribers(this.authState)
  }
}

function getAuthClientOptions(
  options?: ClientManagerAuthClientOptions
): ClientManagerAuthClientOptions | undefined {
  if (!options) {
    return undefined
  }

  return {
    identityProvider: options.identityProvider,
    windowOpenerFeatures: options.windowOpenerFeatures,
    openIdProvider: getAuthClientOpenIdProvider(options.openIdProvider),
  }
}

function getAuthClientOpenIdProvider(
  openIdProvider?: ClientManagerAuthClientOptions["openIdProvider"]
): ClientManagerAuthClientOptions["openIdProvider"] | undefined {
  return openIdProvider === "google" ||
    openIdProvider === "apple" ||
    openIdProvider === "microsoft"
    ? openIdProvider
    : undefined
}

function hasAuthClientOptions(
  options?: ClientManagerAuthClientOptions
): boolean {
  return Boolean(
    options?.identityProvider ||
    options?.windowOpenerFeatures ||
    options?.openIdProvider
  )
}

function getSignInOptions(
  options?: ClientManagerSignInOptions
): AuthClientSignInOptions | undefined {
  if (!options) {
    return undefined
  }

  return {
    maxTimeToLive: options.maxTimeToLive,
    targets: options.targets,
  }
}
