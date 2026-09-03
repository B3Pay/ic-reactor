import type { Identity } from "@icp-sdk/core/agent"
import type {
  AuthClientLike,
  AuthClientSignInOptions,
  AuthState,
  AuthenticationClientOptions,
  AuthenticationSignInOptions,
} from "./types.js"
import { ClientManager, isDev } from "@ic-reactor/core"

import { Principal } from "@icp-sdk/core/principal"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import {
  probeLocalInternetIdentity,
  localInternetIdentityUnavailableError,
  type AuthorizePath,
} from "./local-ii-probe.js"
import {
  IC_INTERNET_IDENTITY_PROVIDER,
  INTERNET_IDENTITY_PROVIDER_ENV_KEY,
  LOCAL_INTERNET_IDENTITY_CANISTER_ID,
  localInternetIdentityProvider,
} from "./constants.js"

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
  /**
   * Which authorize path the locally deployed Internet Identity serves, once
   * probed. `undefined` means not probed yet; `null` means it serves no sign-in
   * UI and login should fail with an explanation rather than open a popup onto
   * a gateway error page.
   */
  private localAuthorizePath?: AuthorizePath | null
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
      acceptEnvIdentityProvider(
        canisterEnv?.[INTERNET_IDENTITY_PROVIDER_ENV_KEY] ||
          canisterEnv?.["PUBLIC_INTERNET_IDENTITY_PROVIDER"],
        clientManager
      )
    // Same cookie, same decision. This one only ever reaches a local provider
    // URL, but `allowEnvConfig: false` has to mean the cookie is not consulted
    // rather than mostly not consulted.
    this.internetIdentityId =
      internetIdentityId ||
      (clientManager.trustsEnvConfig
        ? acceptEnvCanisterId(
            canisterEnv?.["internet_identity"] ||
              canisterEnv?.["PUBLIC_CANISTER_ID:internet_identity"] ||
              canisterEnv?.["CANISTER_ID_INTERNET_IDENTITY"]
          )
        : undefined)
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
    // Before resolving options, because resolving them is what picks the
    // provider URL. This is the last async point before `login()` has to stay
    // inside the user gesture, so the answer has to be cached by now.
    await this.ensureLocalAuthorizePath()

    const clientOptions = this.resolveClientOptions(options)

    if (this.authClient && !this.shouldRecreateClient(clientOptions)) {
      return this.authClient
    }

    return this.initializeClient(clientOptions)
  }

  /**
   * Probe the local Internet Identity canister once, and remember what it
   * serves.
   *
   * Only for the derived local provider: an explicitly configured
   * `identityProvider` is the caller's business, and mainnet is fixed.
   */
  private async ensureLocalAuthorizePath(): Promise<void> {
    if (this.localAuthorizePath !== undefined) return
    if (this.identityProvider) return
    if (!this.clientManager.isLocal) return

    const canisterId =
      this.internetIdentityId ?? LOCAL_INTERNET_IDENTITY_CANISTER_ID

    const { path, inconclusive } = await probeLocalInternetIdentity(
      this.clientManager.agent,
      canisterId
    )

    // An inconclusive probe must not change behaviour: the canister may be
    // fine and merely unreachable from here, and a diagnostic that blocks a
    // working login is worse than the failure it explains.
    this.localAuthorizePath = inconclusive ? "/authorize" : path

    if (path === "/#authorize" && !inconclusive) {
      console.warn(
        `[ic-reactor] Internet Identity canister ${canisterId} serves its sign-in UI at ` +
          `"/" rather than "/authorize" — using the legacy #authorize flow. This is a ` +
          `pre-2026 build; newer ones through release-2026-03-16 serve /authorize directly.`
      )
    }
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
      // Returning on the cached flag alone meant a delegation that expired
      // mid-session was never re-observed: the UI kept rendering a signed-in
      // state while every update call failed, and only a reload recovered.
      // Re-ask the client, which reads the cached expiry rather than hitting
      // storage. A throw here is treated as "still valid" so a transient
      // failure cannot sign anyone out.
      if (!this.authClient) {
        return this.authState.identity || undefined
      }
      const stillValid = await Promise.resolve(
        this.authClient.isAuthenticated()
      ).catch(() => true)
      if (stillValid) {
        return this.authState.identity || undefined
      }
      // Expired — drop the stale flag and fall through to re-derive state,
      // which resets the agent to the anonymous identity.
      this.updateState({ isAuthenticated: false })
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
      // Anything that changes auth state — a logout, notably — bumps this. If
      // it moves while the awaits below are in flight, the result we are
      // holding describes a session that has since ended, and installing it
      // would put the signed-out user's delegation back on the agent.
      const revision = this.authStateRevision
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

        if (revision !== this.authStateRevision) {
          // Superseded — leave whatever ran in the meantime in place.
          return this.authState.identity || undefined
        }
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
          "Authentication module is missing or failed to initialize. To use login, install the optional auth peer: npm install @icp-sdk/auth. If it is already installed and your bundler could not resolve it, pass a pre-constructed client instead: new AuthenticationManager({ clientManager, authClient: new AuthClient(...) })"
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
        "Authentication module is missing or failed to initialize. To use logout, install the optional auth peer: npm install @icp-sdk/auth. If it is already installed and your bundler could not resolve it, pass a pre-constructed client instead: new AuthenticationManager({ clientManager, authClient: new AuthClient(...) })"
      )
    }
    this.updateState({ isAuthenticating: true, error: undefined })
    try {
      await this.authClient.signOut(options)
      const identity = await this.authClient.getIdentity()
      this.clientManager.updateAgent(identity)
      this.updateState({
        identity,
        isAuthenticated: false,
        isAuthenticating: false,
      })
    } catch (error) {
      // Without this the manager was left with `isAuthenticating: true` and no
      // recorded error, so a button disabled on `isAuthenticating` stayed stuck
      // and nothing told the app why.
      this.updateState({ error: error as Error, isAuthenticating: false })
      throw error
    }
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
        "Authentication module is missing or failed to initialize. To use login, install the optional auth peer: npm install @icp-sdk/auth. If it is already installed and your bundler could not resolve it, pass a pre-constructed client instead: new AuthenticationManager({ clientManager, authClient: new AuthClient(...) })"
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
    if (!this.clientManager.isLocal) {
      return IC_INTERNET_IDENTITY_PROVIDER
    }

    const canisterId =
      this.internetIdentityId ?? LOCAL_INTERNET_IDENTITY_CANISTER_ID

    // `null` is the probe's positive finding that this build serves no sign-in
    // UI. Throwing here surfaces an actionable message where the caller can see
    // it, instead of opening a popup onto the gateway's verification-error page
    // and leaving the app waiting until the user closes it.
    if (this.localAuthorizePath === null) {
      throw localInternetIdentityUnavailableError(canisterId)
    }

    return localInternetIdentityProvider(
      Number(this.clientManager.agentHost?.port) || 4943,
      this.internetIdentityId,
      this.localAuthorizePath
    )
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
      this.authClientConstructorPromise = importAuthClientModule()
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

/**
 * Loads the optional `@icp-sdk/auth` peer.
 *
 * The `try` is load-bearing, not defensive. webpack flags a dynamic import
 * that sits lexically inside a `try` block as an *optional* dependency
 * (`ImportParserPlugin`: `dep.optional = Boolean(parser.scope.inTry)`), and
 * `Compilation` reports an unresolvable optional dependency as a build
 * *warning* instead of a fatal "Module not found" error, emitting a module
 * that rejects at runtime. Without the `try`, every webpack-based toolchain
 * (webpack, `next build --webpack`, Rspack) fails to build for consumers who
 * never touch authentication, because npm/pnpm do not install optional peers.
 * Do not hoist this import out of the `try`, and do not wrap it in a nested
 * function — webpack resets `inTry` at every function boundary.
 *
 * The specifier must also stay a literal: a variable specifier (or
 * `@vite-ignore`) makes bundlers skip this import entirely, so the bare
 * specifier survives into the browser, where it cannot be resolved without an
 * import map and every login path fails. A literal lets Vite/Rollup/webpack
 * code-split the optional peer, and lets them tree-shake it away for apps that
 * never reference this class.
 */
function importAuthClientModule(): Promise<unknown> {
  try {
    return import("@icp-sdk/auth/client")
  } catch (error) {
    // Native ESM without an import map (and bundlers that neither resolve nor
    // stub the specifier) throw synchronously rather than rejecting.
    return Promise.reject(error)
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

/**
 * Decides whether an Internet Identity provider carried by the `ic_env` cookie
 * may be used.
 *
 * The cookie is written by the replica serving a local or testnet deployment,
 * and it is only authoritative in that setting: cookies are not origin-isolated
 * the way script-accessible storage is, so on a mainnet deployment the identity
 * provider is configuration that belongs in code rather than something read
 * back out of the environment at runtime. `AuthClient` treats `identityProvider`
 * as trusted developer configuration and does not re-check it.
 *
 * This mirrors the root-key guard in `ClientManager` (see `packages/core`):
 * both values arrive from the same cookie and get the same treatment — adopted
 * off-mainnet, ignored on mainnet in favour of the pinned default.
 *
 * A provider on the app's own origin is always accepted: it is exactly as
 * trustworthy as the page doing the asking. Callers that need a custom provider
 * on mainnet pass `identityProvider` explicitly.
 */
function acceptEnvIdentityProvider(
  value: string | undefined,
  clientManager: ClientManager
): string | undefined {
  if (!value) return undefined

  const pageOrigin =
    typeof window !== "undefined" ? window.location?.origin : undefined

  let url: URL
  try {
    url = new URL(value, pageOrigin)
  } catch {
    return undefined
  }

  if (pageOrigin && url.origin === pageOrigin) {
    return url.toString()
  }

  // Positive allowlist, not `!isMainnetHost(...)`.
  //
  // The old comment here claimed this defaulted to true for an unknown host so
  // that "anything that looks like mainnet fails closed". It did not:
  // isMainnetHost defaults to true only for `undefined`, and returns false for
  // every unrecognised host — so a dapp on a custom domain accepted an identity
  // provider chosen by a cookie, and the ic_env cookie is writable by any
  // sibling subdomain. Redirecting the Internet Identity flow is as severe as
  // substituting the root key, so both now use the same test.
  //
  // That test is the ClientManager's single resolved decision rather than a
  // recomputed host test, which silently ignored a caller
  // who had opted in: `allowEnvConfig: true` accepted the cookie's root key and
  // then discarded its identity provider, from the same cookie, on the same
  // host.
  if (!clientManager.trustsEnvConfig) {
    console.warn(
      `[ic-reactor] Ignoring the Internet Identity provider from the ic_env cookie ` +
        `("${url.origin}") because this reactor does not target a local replica, where ` +
        `the provider is taken from configuration rather than the environment. Pass ` +
        `\`identityProvider\` to AuthenticationManager to use a custom provider.`
    )
    return undefined
  }

  return url.toString()
}

/**
 * Accepts an Internet Identity canister ID from `ic_env` only when it parses as
 * a principal.
 *
 * The value is interpolated into a provider URL
 * (`http://<id>.localhost:<port>/authorize`), so anything that is not a bare
 * principal can change the shape of that URL rather than just its subdomain.
 * Only reachable on local networks, since mainnet uses the pinned provider.
 */
function acceptEnvCanisterId(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return Principal.fromText(value).toText()
  } catch {
    return undefined
  }
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
