import type { Identity } from "@icp-sdk/core/agent"
import type {
  AuthClientLike,
  AuthClientSignInOptions,
  AuthState,
  AuthenticationClientOptions,
  AuthenticationSignInOptions,
} from "./types"
import { ClientManager, isDev } from "@ic-reactor/core"

import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import {
  IC_INTERNET_IDENTITY_PROVIDER,
  INTERNET_IDENTITY_PROVIDER_ENV_KEY,
  localInternetIdentityProvider,
} from "./constants"
import { AuthStateStore } from "./auth-state-store"
import { AuthClientLoader } from "./auth-client-loader"

export interface AuthenticationManagerParameters {
  clientManager: ClientManager
  authClient?: AuthClientLike
  identityProvider?: string | URL
  internetIdentityId?: string
}

/**
 * Manages Internet Identity sign-in, session restoration, and authentication
 * state for a {@link ClientManager}.
 *
 * @example
 * ```ts
 * const authentication = new AuthenticationManager({ clientManager })
 * const identity = await authentication.authenticate()
 * ```
 */
export class AuthenticationManager {
  private authClient?: AuthClientLike
  private authPromise?: Promise<Identity | undefined>
  private authClientWasProvided = false
  private readonly stateStore = new AuthStateStore()
  private readonly loader = new AuthClientLoader()
  private readonly identityProvider?: string | URL
  private readonly internetIdentityId?: string
  public readonly clientManager: ClientManager

  /** The current authentication state. */
  public get authState(): AuthState {
    return this.stateStore.state
  }

  constructor({
    clientManager,
    authClient,
    identityProvider,
    internetIdentityId,
  }: AuthenticationManagerParameters) {
    this.clientManager = clientManager
    const canisterEnv =
      typeof window !== "undefined" ? getAuthenticationCanisterEnv() : undefined
    this.identityProvider =
      identityProvider ||
      canisterEnv?.[INTERNET_IDENTITY_PROVIDER_ENV_KEY] ||
      canisterEnv?.["PUBLIC_INTERNET_IDENTITY_PROVIDER"]
    this.internetIdentityId =
      internetIdentityId ||
      canisterEnv?.["internet_identity"] ||
      canisterEnv?.["PUBLIC_CANISTER_ID:internet_identity"] ||
      canisterEnv?.["CANISTER_ID_INTERNET_IDENTITY"]

    if (authClient) {
      this.authClientWasProvided = true
      this.authClient = authClient
      this.syncStateFromClient(this.stateStore.currentRevision).catch(
        (error) => {
          this.updateState({ error: error as Error, isAuthenticating: false })
        }
      )
    } else if (typeof window !== "undefined") {
      this.loader.load().catch(() => {
        // Optional auth support is reported when an auth method is used.
      })
    }
  }

  /** @internal Used by IdentityAttributesManager. */
  public get client() {
    return this.authClient
  }

  public subscribeAuthState(callback: (state: AuthState) => void) {
    return this.stateStore.subscribe(callback)
  }

  /**
   * Preloads and creates an AuthClient before a user gesture is needed.
   */
  public async prepareClient(options?: AuthenticationClientOptions) {
    const clientOptions = getAuthClientOptions({
      ...options,
      identityProvider:
        options?.identityProvider ?? this.getDefaultIdentityProvider(),
    })

    if (
      this.authClient &&
      (!this.shouldRecreateClient(clientOptions) || this.authClientWasProvided)
    ) {
      return this.authClient
    }

    return this.initializeClient(clientOptions)
  }

  public authenticate = async (): Promise<Identity | undefined> => {
    if (this.authState.isAuthenticated) {
      return this.authState.identity || undefined
    }
    if (this.authPromise) {
      return this.authPromise
    }
    if (this.loader.isModuleMissing) {
      return undefined
    }

    this.authPromise = (async () => {
      if (isDev() && typeof window !== "undefined") {
        console.info(
          `%cic-reactor:%c Authenticating...`,
          "color: #3b82f6; font-weight: bold",
          "color: inherit",
          {
            network: this.clientManager.network,
            authClient: this.authClient ? "Shared Instance" : "Dynamic Import",
          }
        )
      }
      this.updateState({ isAuthenticating: true })
      try {
        if (!this.authClient) {
          const authClient = await this.initializeClient(
            getAuthClientOptions({
              identityProvider: this.getDefaultIdentityProvider(),
            })
          )
          if (!authClient) {
            this.updateState({ isAuthenticating: false })
            return undefined
          }
        }
        const identity = await this.authClient!.getIdentity()
        const isAuthenticated = await this.authClient!.isAuthenticated()
        this.clientManager.updateAgent(identity)
        this.updateState({
          identity,
          isAuthenticated,
          isAuthenticating: false,
        })
        return identity
      } catch (error) {
        this.updateState({ error: error as Error, isAuthenticating: false })
        console.error("Authentication failed:", error)
        throw error
      } finally {
        this.authPromise = undefined
      }
    })()

    return this.authPromise
  }

  public login = async (loginOptions?: AuthenticationSignInOptions) => {
    let didCompleteSignIn = false

    try {
      const identityProvider =
        loginOptions?.identityProvider || this.getDefaultIdentityProvider()
      const authClientOptions = getAuthClientOptions({
        ...loginOptions,
        identityProvider,
      })

      if (!this.ensurePreparedClient(authClientOptions)) {
        await this.initializeClient(authClientOptions)
      }

      if (!this.authClient) {
        await this.authenticate()
      }

      if (!this.authClient) {
        throw new Error(
          "Authentication module is missing or failed to initialize. To use login, please install the auth package: npm install @icp-sdk/auth"
        )
      }

      this.updateState({ isAuthenticating: true, error: undefined })
      const identity = await this.signInOrRecoverIdentity(
        getSignInOptions(loginOptions)
      )

      if (!this.clientManager.agentState.isInitialized) {
        await this.clientManager.initializeAgent()
      }

      this.clientManager.updateAgent(identity)
      this.updateState({
        identity,
        isAuthenticated: true,
        isAuthenticating: false,
      })
      didCompleteSignIn = true

      try {
        await loginOptions?.onSuccess?.()
      } catch (callbackError) {
        this.updateState({ error: callbackError as Error })
        await loginOptions?.onError?.((callbackError as Error).message)
        throw callbackError
      }
    } catch (error) {
      if (!didCompleteSignIn) {
        await loginOptions?.onError?.((error as Error).message)
        this.updateState({
          error: error as Error,
          isAuthenticating: false,
        })
      }
      throw error
    }
  }

  public logout = async (options?: { returnTo?: string }) => {
    if (!this.authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To use logout, please install the auth package: npm install @icp-sdk/auth"
      )
    }
    this.updateState({ isAuthenticating: true, error: undefined })
    await this.authClient.signOut(options)
    const identity = await this.authClient.getIdentity()
    this.clientManager.updateAgent(identity)
    this.updateState({
      identity,
      isAuthenticated: false,
      isAuthenticating: false,
    })
  }

  private async initializeClient(
    options?: AuthenticationClientOptions
  ): Promise<AuthClientLike | undefined> {
    const AuthClient = await this.loader.load()

    if (!AuthClient) {
      return undefined
    }

    this.authClient = new AuthClient(options)
    return this.authClient
  }

  /** @internal Used by IdentityAttributesManager. */
  public async signInOrRecoverIdentity(
    options?: AuthClientSignInOptions
  ): Promise<Identity> {
    if (!this.authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To use login, please install the auth package: npm install @icp-sdk/auth"
      )
    }

    try {
      return await this.authClient.signIn(options)
    } catch (error) {
      const identity = await Promise.resolve(
        this.authClient.getIdentity()
      ).catch(() => null)
      const isAuthenticated = await Promise.resolve(
        this.authClient.isAuthenticated()
      ).catch(() => false)

      if (identity && isAuthenticated) {
        return identity
      }

      throw error
    }
  }

  private ensurePreparedClient(
    options?: AuthenticationClientOptions
  ): AuthClientLike | undefined {
    if (
      this.authClient &&
      (!this.shouldRecreateClient(options) || this.authClientWasProvided)
    ) {
      return this.authClient
    }

    const AuthClient = this.loader.cachedConstructor
    if (!AuthClient || this.authClientWasProvided) {
      return undefined
    }

    this.authClient = new AuthClient(options)
    return this.authClient
  }

  private shouldRecreateClient(options?: AuthenticationClientOptions): boolean {
    return !this.authClientWasProvided && hasAuthClientOptions(options)
  }

  private async syncStateFromClient(
    revision = this.stateStore.currentRevision
  ) {
    if (!this.authClient) {
      return
    }

    const identity = await this.authClient.getIdentity()
    const isAuthenticated = await this.authClient.isAuthenticated()
    if (revision !== this.stateStore.currentRevision) {
      return
    }
    this.clientManager.updateAgent(identity)
    this.updateState({
      identity,
      isAuthenticated,
      isAuthenticating: false,
      error: undefined,
    })
  }

  /** @internal Used by IdentityAttributesManager. */
  public async ensureClient(options?: AuthenticationClientOptions) {
    const clientOptions = getAuthClientOptions({
      ...options,
      identityProvider:
        options?.identityProvider ?? this.getDefaultIdentityProvider(),
    })
    if (!this.ensurePreparedClient(clientOptions)) {
      await this.initializeClient(clientOptions)
    }
    return this.authClient
  }

  /** @internal Used by IdentityAttributesManager. */
  public async commitIdentity(identity: Identity, isAuthenticated: boolean) {
    if (!this.clientManager.agentState.isInitialized) {
      await this.clientManager.initializeAgent()
    }
    this.clientManager.updateAgent(identity)
    this.updateState({ identity, isAuthenticated, isAuthenticating: false })
  }

  /** @internal Used by IdentityAttributesManager. */
  public setAuthenticating() {
    this.updateState({ isAuthenticating: true, error: undefined })
  }

  /** @internal Used by IdentityAttributesManager. */
  public setAuthenticationError(error: Error) {
    this.updateState({ error, isAuthenticating: false })
  }

  private getDefaultIdentityProvider(): string | URL {
    if (this.identityProvider) {
      return this.identityProvider
    }
    return this.clientManager.isLocal
      ? localInternetIdentityProvider(
          Number(this.clientManager.agentHost?.port) || 4943,
          this.internetIdentityId
        )
      : IC_INTERNET_IDENTITY_PROVIDER
  }

  private updateState(newState: Partial<AuthState>) {
    this.stateStore.update(newState)
  }
}

function getAuthClientOptions(
  options?: AuthenticationClientOptions
): AuthenticationClientOptions | undefined {
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
  openIdProvider?: AuthenticationClientOptions["openIdProvider"]
): AuthenticationClientOptions["openIdProvider"] | undefined {
  return openIdProvider === "google" ||
    openIdProvider === "apple" ||
    openIdProvider === "microsoft"
    ? openIdProvider
    : undefined
}

function hasAuthClientOptions(options?: AuthenticationClientOptions): boolean {
  return Boolean(
    options?.identityProvider ||
    options?.windowOpenerFeatures ||
    options?.openIdProvider
  )
}

function getAuthenticationCanisterEnv(): Record<string, string> | undefined {
  const canisterEnv = safeGetCanisterEnv<Record<string, string>>()
  if (canisterEnv) {
    return canisterEnv as unknown as Record<string, string>
  }

  if (typeof document === "undefined") {
    return undefined
  }

  const cookie = document.cookie
    .split(";")
    .find((part) => part.trim().startsWith("ic_env="))
  const encodedValue = cookie?.split("=").slice(1).join("=")?.trim()
  if (!encodedValue) {
    return undefined
  }

  const env = Object.fromEntries(
    decodeURIComponent(encodedValue)
      .split("&")
      .map((entry) => {
        const separatorIndex = entry.indexOf("=")
        return separatorIndex === -1
          ? [entry, ""]
          : [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)]
      })
  )

  return Object.keys(env).length ? env : undefined
}

function getSignInOptions(
  options?: AuthenticationSignInOptions
): AuthClientSignInOptions | undefined {
  if (!options) {
    return undefined
  }

  return {
    maxTimeToLive: options.maxTimeToLive,
    targets: options.targets,
  }
}
