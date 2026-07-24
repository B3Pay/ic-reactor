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

export interface AuthenticationManagerParameters extends AuthenticationClientOptions {
  clientManager: ClientManager
  /**
   * Bring your own client instance. When provided, IC Reactor never constructs
   * one and never applies the options below to it.
   */
  authClient?: AuthClientLike
  /** Canister ID of a locally deployed Internet Identity. */
  internetIdentityId?: string
}

type AuthClientConstructor = {
  new (options?: AuthenticationClientOptions): AuthClientLike
}

const AUTH_CLIENT_MODULE = "@icp-sdk/auth/client"

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
  private authStateRevision = 0
  private authStateSubscribers: Array<(state: AuthState) => void> = []
  private authClientConstructor?: AuthClientConstructor
  private authClientConstructorPromise?: Promise<
    AuthClientConstructor | undefined
  >
  private authModuleMissing = false
  private authClientOptions?: AuthenticationClientOptions
  private authStateValue: AuthState = {
    identity: null,
    isAuthenticating: false,
    isAuthenticated: false,
    error: undefined,
  }
  private readonly identityProvider?: string | URL
  private readonly internetIdentityId?: string
  private readonly defaultClientOptions: AuthenticationClientOptions
  public readonly clientManager: ClientManager

  /** The current authentication state. */
  public get authState(): AuthState {
    return this.authStateValue
  }

  constructor({
    clientManager,
    authClient,
    identityProvider,
    internetIdentityId,
    ...clientOptions
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
    this.defaultClientOptions = clientOptions

    if (authClient) {
      this.authClientWasProvided = true
      this.authClient = authClient
      this.syncStateFromClient(this.authStateRevision).catch((error) => {
        this.updateState({ error: error as Error, isAuthenticating: false })
      })
    } else if (typeof window !== "undefined") {
      this.loadAuthClientConstructor().catch(() => {
        // Optional auth support is reported when an auth method is used.
      })
    }
  }

  /** @internal Used by IdentityAttributesManager. */
  public get client() {
    return this.authClient
  }

  public subscribeAuthState(callback: (state: AuthState) => void) {
    this.authStateSubscribers.push(callback)
    return () => {
      this.authStateSubscribers = this.authStateSubscribers.filter(
        (subscriber) => subscriber !== callback
      )
    }
  }

  /**
   * Preloads the auth module and creates an AuthClient ahead of time.
   *
   * Call (and await) this before wiring up a login button: it makes
   * {@link login} and {@link IdentityAttributesManager.request} able to open
   * the identity provider synchronously inside the click handler, which is
   * what browser popup blockers and the ICRC-29 transport require.
   */
  public async prepareClient(options?: AuthenticationClientOptions) {
    const clientOptions = this.resolveClientOptions(options)

    if (this.authClient && !this.shouldRecreateClient(clientOptions)) {
      return this.authClient
    }

    return this.initializeClient(clientOptions)
  }

  /**
   * Returns an AuthClient without awaiting, or `undefined` when the auth
   * module has not been loaded yet.
   *
   * Callers that must stay inside a user gesture use this instead of
   * {@link ensureClient}; awaiting anything before opening the identity
   * provider window loses the gesture.
   */
  public getPreparedClient(
    options?: AuthenticationClientOptions
  ): AuthClientLike | undefined {
    return this.ensurePreparedClient(this.resolveClientOptions(options))
  }

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
            network: this.clientManager.network,
            authClient: this.authClient ? "Shared Instance" : "Dynamic Import",
          }
        )
      }
      this.updateState({ isAuthenticating: true })
      try {
        if (!this.authClient) {
          const authClient = await this.initializeClient(
            this.resolveClientOptions()
          )
          if (!authClient) {
            this.updateState({ isAuthenticating: false })
            return undefined
          }
        }
        const identity = await this.authClient!.getIdentity()
        const isAuthenticated = await this.authClient!.isAuthenticated()
        // Restoring an anonymous session is the common first-load case; pushing
        // it through updateAgent would invalidate the whole query cache on
        // every mount for nothing.
        if (isAuthenticated || !identity.getPrincipal().isAnonymous()) {
          this.clientManager.updateAgent(identity)
        }
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
      const authClientOptions = this.resolveClientOptions(loginOptions)

      // Stays synchronous when `prepareClient()` has already loaded the auth
      // module, so `signIn()` still runs inside the caller's click handler.
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
    const AuthClient = await this.loadAuthClientConstructor()

    if (!AuthClient) {
      return undefined
    }

    this.authClient = new AuthClient(options)
    this.authClientOptions = options
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
    if (this.authClient && !this.shouldRecreateClient(options)) {
      return this.authClient
    }

    const AuthClient = this.authClientConstructor
    if (!AuthClient || this.authClientWasProvided) {
      return undefined
    }

    this.authClient = new AuthClient(options)
    this.authClientOptions = options
    return this.authClient
  }

  /**
   * Only rebuild the client when the effective options actually changed.
   *
   * Recreating on every call would discard the client warmed up by
   * `prepareClient()` and register a duplicate sign-out callback on the
   * shared IdleManager singleton each time.
   */
  private shouldRecreateClient(options?: AuthenticationClientOptions): boolean {
    if (this.authClientWasProvided) {
      return false
    }
    return !isSameAuthClientOptions(this.authClientOptions, options)
  }

  /**
   * Merges constructor-level defaults with per-call overrides and fills in the
   * network-appropriate identity provider.
   */
  private resolveClientOptions(
    options?: AuthenticationClientOptions
  ): AuthenticationClientOptions {
    const merged = getAuthClientOptions({
      ...this.defaultClientOptions,
      ...options,
    })

    return {
      ...merged,
      identityProvider:
        merged?.identityProvider ?? this.getDefaultIdentityProvider(),
    }
  }

  private async syncStateFromClient(revision = this.authStateRevision) {
    if (!this.authClient) {
      return
    }

    const identity = await this.authClient.getIdentity()
    const isAuthenticated = await this.authClient.isAuthenticated()
    if (revision !== this.authStateRevision) {
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
    const clientOptions = this.resolveClientOptions(options)
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
    if (isDev()) console.debug("[ic-reactor] Updating Auth State:", newState)
    this.authStateRevision += 1
    this.authStateValue = { ...this.authStateValue, ...newState }
    this.authStateSubscribers.forEach((subscriber) =>
      subscriber(this.authStateValue)
    )
  }

  private async loadAuthClientConstructor() {
    if (this.authClientConstructor) {
      return this.authClientConstructor
    }

    if (!this.authClientConstructorPromise) {
      // Keep the optional auth peer out of non-auth bundles. Vite/Rollup/esbuild
      // can otherwise try to resolve this package even when auth APIs are unused.
      this.authClientConstructorPromise = import(
        /* @vite-ignore */ AUTH_CLIENT_MODULE
      )
        .then((authModule) => {
          const AuthClient = (
            authModule as { AuthClient?: AuthClientConstructor }
          ).AuthClient

          if (!AuthClient) {
            throw new Error("@icp-sdk/auth/client did not export AuthClient")
          }

          this.authClientConstructor = AuthClient
          return AuthClient
        })
        .catch((error) => {
          this.authModuleMissing = true
          this.authClientConstructorPromise = undefined
          if (
            error instanceof Error &&
            error.message.includes("did not export AuthClient")
          ) {
            throw error
          }
          return undefined
        })
    }

    return this.authClientConstructorPromise
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
    derivationOrigin: options.derivationOrigin,
    storage: options.storage,
    keyType: options.keyType,
    idleOptions: options.idleOptions,
    identity: options.identity,
    transport: options.transport,
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

/**
 * Compares the options two AuthClients would be built from. Object-valued
 * options (`storage`, `identity`, `idleOptions`) are compared by reference,
 * which is what module-scoped configuration produces.
 */
function isSameAuthClientOptions(
  current?: AuthenticationClientOptions,
  next?: AuthenticationClientOptions
): boolean {
  if (current === next) {
    return true
  }
  if (!current || !next) {
    return false
  }

  return (
    String(current.identityProvider ?? "") ===
      String(next.identityProvider ?? "") &&
    current.windowOpenerFeatures === next.windowOpenerFeatures &&
    current.openIdProvider === next.openIdProvider &&
    String(current.derivationOrigin ?? "") ===
      String(next.derivationOrigin ?? "") &&
    current.storage === next.storage &&
    current.keyType === next.keyType &&
    current.idleOptions === next.idleOptions &&
    current.identity === next.identity &&
    current.transport === next.transport
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
