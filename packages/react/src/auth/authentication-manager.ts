import type { Identity } from "@icp-sdk/core/agent"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { isDelegationValid, type DelegationChain } from "@icp-sdk/core/identity"
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
import {
  detectAuthClientFlavor,
  detectAuthClientInstanceFlavor,
  toAuthClientConstructorOptions,
  toAuthClientSignInOptions,
  type AuthClientFlavor,
  type IdentityProviderPairing,
} from "./auth-client-compat.js"

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

/**
 * What `@icp-sdk/auth` v9 and later add to a client, read by shape because
 * {@link AuthClientLike} describes the methods every supported major shares.
 */
type SubscribableAuthClient = AuthClientLike & {
  subscribe?: (listener: () => void) => () => void
  getPrincipal?: () => Principal | undefined
}

type AuthClientConstructor = {
  // The translated options are the installed client's shape, not IC Reactor's:
  // `toAuthClientConstructorOptions` rewrites them per detected flavor, so this
  // stays deliberately open rather than asserting a contract that varies.
  new (options?: unknown): AuthClientLike
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
  private authClientFlavor: AuthClientFlavor = "legacy"
  private authClientOptions?: AuthenticationClientOptions
  private authStateValue: AuthState = {
    identity: null,
    isAuthenticating: false,
    isAuthenticated: false,
    error: undefined,
  }
  /** See {@link sessionChecked}. */
  private sessionCheckedValue = false
  private sessionCheckedSubscribers: Array<() => void> = []
  /** Stops following the current client's session record; see `watchClient()`. */
  private unwatchClient?: () => void
  /**
   * Set when the client's session record changed while an operation of this
   * manager's own was running; see `followClient()`.
   */
  private clientChangedDuringOperation = false
  /** Counts `followClient()` passes, so that only the latest one publishes. */
  private followRevision = 0
  /** Counts `dispose()` calls; see {@link releaseCount}. */
  private releases = 0
  private readonly identityProvider?: string | URL
  /** The provider taken from the `ic_env` cookie, when no caller set one. */
  private readonly envIdentityProvider?: string | URL
  private readonly internetIdentityId?: string
  /** Whether `internetIdentityId` came from the caller rather than the cookie. */
  private readonly internetIdentityIdIsExplicit: boolean
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
    this.envIdentityProvider = identityProvider
      ? undefined
      : acceptEnvIdentityProvider(
          canisterEnv?.[INTERNET_IDENTITY_PROVIDER_ENV_KEY] ||
            canisterEnv?.["PUBLIC_INTERNET_IDENTITY_PROVIDER"],
          clientManager
        )
    this.identityProvider = identityProvider || this.envIdentityProvider
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
    this.internetIdentityIdIsExplicit = Boolean(internetIdentityId)
    this.defaultClientOptions = clientOptions

    if (authClient) {
      this.authClientWasProvided = true
      this.authClient = authClient
      // A caller-built client never goes through the module loader that
      // detects the flavor, so read it off the instance. Without this a v10
      // client handed in here was treated as v8, and `targets` reached it
      // without the warning that it is ignored.
      this.authClientFlavor = detectAuthClientInstanceFlavor(authClient)
      this.watchClient(authClient)
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

  /**
   * @internal Used by the auth hooks.
   *
   * Whether this manager has checked its client for a session: a restore has
   * settled, whether it found a session, found none or failed, or a sign-in or
   * sign-out has completed. Until then {@link authState} is the signed-out state
   * the manager starts in, which says nothing about the session, so the auth
   * hooks report `isAuthenticating: true` instead.
   */
  public get sessionChecked(): boolean {
    return this.sessionCheckedValue
  }

  /**
   * @internal Used by the auth hooks.
   *
   * Records that the session has been checked, and tells the auth hooks the
   * first time. A restore that failed counts: waiting on one that will not be
   * retried would leave the hooks reporting `isAuthenticating: true` for good.
   */
  public markSessionChecked() {
    if (this.sessionCheckedValue) return
    this.sessionCheckedValue = true
    const subscribers = this.sessionCheckedSubscribers
    this.sessionCheckedSubscribers = []
    for (const subscriber of subscribers) subscriber()
  }

  /**
   * @internal Used by the auth hooks.
   *
   * How many times {@link dispose} has run. A restore the hooks started
   * compares it with the count it began with, to tell whether the manager was
   * released while it ran.
   */
  public get releaseCount(): number {
    return this.releases
  }

  /**
   * @internal Used by the auth hooks.
   *
   * Calls `callback` once, when {@link sessionChecked} turns true. Nothing else
   * announces it when the check that settles it publishes no state, as a
   * restore that failed before it read the client does not.
   *
   * @returns An unsubscribe function.
   */
  public subscribeSessionChecked(callback: () => void) {
    if (this.sessionCheckedValue) return () => {}
    const subscription = () => callback()
    this.sessionCheckedSubscribers.push(subscription)
    return () => {
      this.sessionCheckedSubscribers = this.sessionCheckedSubscribers.filter(
        (subscriber) => subscriber !== subscription
      )
    }
  }

  /**
   * Releases the `@icp-sdk/auth` client this manager built.
   *
   * A v10 client hooks the page when it is built: activity listeners on
   * `document`, focus and visibility listeners, a watch on the session record
   * that every tab shares and, once signed in, a refresh timer. Nothing
   * releases them when the manager is dropped, so a manager built per mount,
   * as a server-rendered app builds one in its provider, left one live client
   * behind on each remount. Call this when you discard the manager, from the
   * cleanup of whatever built it.
   *
   * The client is disposed and forgotten, so a later {@link prepareClient},
   * {@link login}, {@link logout} or restore that needs a client builds a new
   * one. That keeps it safe in an effect cleanup under React's StrictMode,
   * which runs the cleanup and then the effect again on the same manager. With
   * `@icp-sdk/auth` v8 there is nothing to release, and the manager only drops
   * its reference. A client passed in as `authClient` belongs to the caller: it
   * is never disposed, and the manager goes on using it, but stops following its
   * session record until its next {@link prepareClient}, {@link login} or
   * {@link authenticate}, so that the caller's client does not keep a
   * discarded manager alive.
   *
   * The auth state and the identity on the agent are left as they are. A
   * restore reading the client when it is released ends without publishing
   * what it read, and a sign-in or sign-out under way ends with what the
   * released client reports. A restore `useAuth()` started stops, and
   * releases any client it built meanwhile, once no `useAuth()` of this
   * manager is mounted; one mounted later restores again.
   *
   * @example
   * ```tsx
   * const [authentication] = useState(
   *   () => new AuthenticationManager({ clientManager })
   * )
   * useEffect(() => () => authentication.dispose(), [authentication])
   * ```
   */
  public dispose(): void {
    this.releases++
    this.stopWatchingClient()
    if (this.authClientWasProvided) {
      return
    }
    const client = this.authClient
    this.authClient = undefined
    this.authClientOptions = undefined
    if (client) {
      disposeClient(client)
    }
  }

  /**
   * Subscribes to auth state changes.
   *
   * Callbacks run in the order they subscribed, after the state has changed. A
   * callback that throws does not stop the others; the first error is rethrown
   * to whatever made the change once they have all run. When a callback itself
   * changes the state, the newer state is the last each callback hears.
   *
   * @param callback - Function called with the new state.
   * @returns An unsubscribe function.
   */
  public subscribeAuthState(callback: (state: AuthState) => void) {
    // Each subscription gets an entry of its own, so the unsubscribe it returns
    // removes that one registration and no other. Filtering on the callback
    // itself removed every registration of a function subscribed twice, as
    // `ClientManager.subscribe` did before #513.
    const subscription = (state: AuthState) => callback(state)
    this.authStateSubscribers.push(subscription)
    return () => {
      this.authStateSubscribers = this.authStateSubscribers.filter(
        (subscriber) => subscriber !== subscription
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
      this.watchClient(this.authClient)
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
    const authorizePath = inconclusive ? "/authorize" : path

    // With no sign-in UI, login fails with advice that depends on the
    // installed @icp-sdk/auth major. A client IC Reactor builds itself shows
    // its major only once the module has loaded, and that import is usually
    // still in flight when the probe answers. Wait for it before recording the
    // finding, so nothing reads `null` while the flavor still holds its
    // `legacy` default and hands a v10 app the v8 advice.
    if (authorizePath === null && !this.authClientWasProvided) {
      await this.loadAuthClientConstructor().catch(() => undefined)
    }

    this.localAuthorizePath = authorizePath

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
   * `ensureClient`; awaiting anything before opening the identity
   * provider window loses the gesture.
   */
  public getPreparedClient(
    options?: AuthenticationClientOptions
  ): AuthClientLike | undefined {
    return this.ensurePreparedClient(this.resolveClientOptions(options))
  }

  public authenticate = async (): Promise<Identity | undefined> => {
    const releases = this.releases
    try {
      return await this.checkSession()
    } finally {
      // Marked once the result is published, so the hooks never show the
      // starting state as the answer. A failed restore settles it too. One
      // that `dispose()` cut short read nothing, and leaves the check to the
      // restore of whatever mounts this manager again.
      if (releases === this.releases || this.authClient) {
        this.markSessionChecked()
      }
    }
  }

  private async checkSession(): Promise<Identity | undefined> {
    if (this.authClient) {
      this.watchClient(this.authClient)
    }
    if (this.authState.isAuthenticated) {
      // Returning on the cached flag alone meant a delegation that expired
      // mid-session was never re-observed: the UI kept rendering a signed-in
      // state while every update call failed, and only a reload recovered.
      // Re-ask the client, which reads the cached expiry rather than hitting
      // storage. A throw here is treated as "still valid" so a transient
      // failure cannot sign anyone out. A v8 delegation that has expired is
      // not valid whatever the client answers: see vouchesFor().
      if (!this.authClient) {
        return this.authState.identity || undefined
      }
      const isAuthenticated = await Promise.resolve(
        this.authClient.isAuthenticated()
      ).catch(() => true)
      if (this.vouchesFor(this.authState.identity, isAuthenticated)) {
        return this.authState.identity || undefined
      }
      // Expired, or ended in another tab. The v8 client keeps handing out the
      // lapsed delegation from getIdentity() until signOut() runs (only a
      // fresh page load purges it). End the session explicitly, in this tab
      // only: see expireSession().
      await this.expireSession(isAuthenticated)
      return undefined
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
        let client =
          this.authClient ??
          (await this.initializeClient(this.resolveClientOptions()))
        if (!client) {
          this.updateState({ isAuthenticating: false })
          return undefined
        }
        let { clientIdentity, isAuthenticated } =
          await this.readClientSession(client)
        // Per-call options can replace the client while it is read, and
        // `dispose()` can release it. Both answers used to be read from
        // whichever client was current at the time, so they could come from two
        // clients. A v10 client disposed while it restores hands out the
        // anonymous identity, and the record its replacement reads still says
        // signed in: the manager reported the anonymous principal signed in.
        // The client in use now is read instead, and a manager that let go of
        // its client publishes nothing. Nothing may be signed with what a
        // released client held.
        while (
          revision === this.authStateRevision &&
          client !== this.authClient
        ) {
          if (!this.authClient) {
            this.updateState({ isAuthenticating: false })
            return this.authState.identity || undefined
          }
          client = this.authClient
          ;({ clientIdentity, isAuthenticated } =
            await this.readClientSession(client))
        }

        if (revision !== this.authStateRevision) {
          // Superseded — leave whatever ran in the meantime in place.
          return this.authState.identity || undefined
        }
        // A client that says it is not authenticated but still hands out a
        // non-anonymous identity is holding a delegation it will no longer
        // vouch for (expired, mid-session). So is a v8 client that says it is,
        // once another tab has signed in again, while it hands out the
        // delegation that lapsed in this one. Nothing may be signed with it.
        const identity =
          isAuthenticated || clientIdentity.getPrincipal().isAnonymous()
            ? clientIdentity
            : new AnonymousIdentity()
        // Restoring an anonymous session is the common first-load case; pushing
        // it through updateAgent would invalidate the whole query cache on
        // every mount for nothing. It is only skipped while the agent is
        // anonymous too, so a lapsed delegation still gets replaced.
        if (
          isAuthenticated ||
          !identity.getPrincipal().isAnonymous() ||
          !this.agentIsAnonymous()
        ) {
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
      this.publishSession({
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
        // Recorded before the callback runs, as on success: an onError that
        // rejected used to skip this and strand `isAuthenticating: true` with
        // no error on record.
        this.updateState({
          error: error as Error,
          isAuthenticating: false,
        })
        await loginOptions?.onError?.((error as Error).message)
      }
      throw error
    }
  }

  public logout = async (options?: { returnTo?: string }) => {
    // None built yet, or released by `dispose()`. Signing out needs no user
    // gesture, so one can be built here.
    const client = this.authClient ?? (await this.ensureClient())
    if (!client) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To use logout, install the optional auth peer: npm install @icp-sdk/auth. If it is already installed and your bundler could not resolve it, pass a pre-constructed client instead: new AuthenticationManager({ clientManager, authClient: new AuthClient(...) })"
      )
    }
    this.updateState({ isAuthenticating: true, error: undefined })
    try {
      // The client the sign-out started on, even once `dispose()` has released
      // it, as when the sign-out closes the widget that built this manager.
      // Reading `this.authClient` then failed the sign-out with a TypeError.
      await client.signOut(options)
      const identity = await client.getIdentity()
      this.clientManager.updateAgent(identity)
      this.publishSession({
        identity,
        isAuthenticated: false,
        isAuthenticating: false,
      })
    } catch (error) {
      // A failed signOut does not always mean the session survived. v10 wipes
      // the device and drops to an anonymous identity before it raises a revoke
      // the canister did not answer, so keeping the session here left the app
      // signed in and the agent signing as the user who had just signed out.
      // Follow the client instead: once it no longer vouches for the session,
      // nothing may sign with it, which is the rule `authenticate()` applies
      // too. A v8 client that failed before forgetting anything still vouches
      // for its session and keeps it, unless its delegation has lapsed (see
      // vouchesFor()). A check that throws keeps it as well.
      //
      // Anything that changes auth state while that check is in flight, such
      // as a login that finishes meanwhile, bumps this. The check then
      // describes a client that has been used since, and its answer must not
      // replace the newer state, as in `authenticate()`.
      const revision = this.authStateRevision
      const stillSignedIn = await Promise.resolve()
        .then(() => client.isAuthenticated())
        .catch(() => true)
      if (revision !== this.authStateRevision) {
        throw error
      }
      if (this.vouchesFor(this.authState.identity, stillSignedIn)) {
        // Without this the manager was left with `isAuthenticating: true` and
        // no recorded error, so a button disabled on `isAuthenticating` stayed
        // stuck and nothing told the app why.
        this.publishSession({ error: error as Error, isAuthenticating: false })
      } else {
        const identity = new AnonymousIdentity()
        this.clientManager.updateAgent(identity)
        // The error stays recorded: the device is signed out, but the session
        // may still be live at the identity provider.
        this.publishSession({
          identity,
          isAuthenticated: false,
          isAuthenticating: false,
          error: error as Error,
        })
      }
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

    // Every mounted `useAuth()` prepares the client at the same moment, and
    // each call arrives here after the same await. Building one per caller
    // left all but the last running with nothing able to reach them: on v8
    // each registered the app's `onIdle` on the shared IdleManager again, so it
    // fired once per consumer, and on v10 each kept its browser listeners and
    // its session's refresh timer. Take the client an earlier caller built for
    // the same options instead.
    if (this.authClient && !this.shouldRecreateClient(options)) {
      return this.authClient
    }

    return this.installClient(
      new AuthClient(this.toClientOptions(options)),
      options
    )
  }

  /**
   * Makes `client`, which this manager built for `options`, the current one.
   *
   * The client it replaces was built here too, for other options: a caller's
   * `authClient` is never replaced. It was dropped with nothing released, so a
   * v10 client kept its browser listeners, its state subscription and its
   * session's refresh timer for the life of the page, one more for each switch
   * between option sets, such as a one-click sign-in and a plain one (#729).
   * v10 asks for `dispose()` on a client being discarded, and a new
   * interaction already takes its signer channel from the old client, so this
   * adds no failure of its own. A v8 client has nothing to dispose; see
   * `withSharedIdleCallback()` for the callback it leaves registered.
   */
  private installClient(
    client: AuthClientLike,
    options?: AuthenticationClientOptions
  ): AuthClientLike {
    const replaced = this.authClient
    this.stopWatchingClient()
    this.authClient = client
    this.authClientOptions = options
    if (replaced && replaced !== client) {
      disposeClient(replaced)
    }
    this.watchClient(client)
    return client
  }

  /**
   * Follows a v10 client's session record, which every tab of the origin
   * shares.
   *
   * The manager learned about the session only through its own calls, while a
   * v10 client follows the other tabs. After a sign-out in another tab, this
   * tab's client dropped the session and its manager went on reporting the
   * user signed in, with the replaced identity on the agent signing calls as
   * the account the user had left. After a sign-in there as another account,
   * the manager kept the old account while the client held the new one. When
   * the old identity's app delegation then lapsed, its mint was refused and
   * the client removed the record every tab reads, signing the new account out
   * of every tab (#754). `subscribe()` fires after the record changes, here or
   * in another tab, and the manager then reads the client again.
   *
   * v8 has no notification and never revokes a session, so a v8 client is not
   * followed.
   */
  private watchClient(client: AuthClientLike) {
    if (this.unwatchClient || this.authClientFlavor !== "session") {
      return
    }
    const { subscribe } = client as SubscribableAuthClient
    if (typeof subscribe !== "function") {
      return
    }
    this.unwatchClient = subscribe.call(client, () => {
      // The client tells its listeners before it starts restoring for the new
      // record, which it does right after they return. Reading it a microtask
      // later waits for that restore. The state is published whether or not a
      // subscriber throws, and there is no caller to hand that error to.
      void Promise.resolve()
        .then(() => this.followClient(client))
        .catch(() => undefined)
    })
  }

  private stopWatchingClient() {
    this.unwatchClient?.()
    this.unwatchClient = undefined
  }

  /**
   * Reads the session from `client` after its record changed, and publishes
   * it when it differs from what this manager holds, as `syncStateFromClient()`
   * derives it. An error recorded for the session it replaces goes with it.
   *
   * An operation of the manager's own, which sets `isAuthenticating`, writes
   * the record itself and publishes what the client holds when it ends, so a
   * change during one is read again once it has. So is a change whose read
   * something else published over.
   */
  private async followClient(client: AuthClientLike): Promise<void> {
    if (client !== this.authClient) {
      return
    }
    if (this.authState.isAuthenticating) {
      this.clientChangedDuringOperation = true
      return
    }
    const pass = ++this.followRevision
    const revision = this.authStateRevision
    const session = await this.readFollowedSession(client)
    if (pass !== this.followRevision || client !== this.authClient) {
      return
    }
    if (revision !== this.authStateRevision) {
      return this.followClient(client)
    }
    if (!session) {
      return
    }
    const current = this.authState
    const anonymous = session.identity.getPrincipal().isAnonymous()
    const unchanged =
      session.isAuthenticated === current.isAuthenticated &&
      (session.identity === current.identity ||
        (!session.isAuthenticated &&
          anonymous &&
          current.identity?.getPrincipal().isAnonymous() === true))
    if (unchanged) {
      this.markSessionChecked()
      return
    }
    // As in `authenticate()`, an agent that is anonymous already is left as
    // it is.
    if (!anonymous || !this.agentIsAnonymous()) {
      this.clientManager.updateAgent(session.identity)
    }
    this.publishSession({
      identity: session.identity,
      isAuthenticated: session.isAuthenticated,
      isAuthenticating: false,
      error: undefined,
    })
  }

  /**
   * The identity `client` hands out, and whether it vouches for it (see
   * `vouchesFor()`). Both are read from the same client.
   */
  private async readClientSession(client: AuthClientLike) {
    const clientIdentity = await client.getIdentity()
    const isAuthenticated = this.vouchesFor(
      clientIdentity,
      await client.isAuthenticated()
    )
    return { clientIdentity, isAuthenticated }
  }

  /**
   * The session `client` holds, or `undefined` to leave the manager's as it is.
   *
   * v10 refuses to hand out an identity while the record names a sign-in it
   * holds no credential for, as when restoring the account another tab signed
   * in as failed. The session this manager holds is kept then only while the
   * record still names its account. One for any other account must not stay
   * on the agent.
   */
  private async readFollowedSession(
    client: AuthClientLike
  ): Promise<{ identity: Identity; isAuthenticated: boolean } | undefined> {
    try {
      const { clientIdentity, isAuthenticated } =
        await this.readClientSession(client)
      // The rule `authenticate()` applies to an identity the client no longer
      // vouches for.
      const identity =
        isAuthenticated || clientIdentity.getPrincipal().isAnonymous()
          ? clientIdentity
          : new AnonymousIdentity()
      return { identity, isAuthenticated }
    } catch {
      const { isAuthenticated, identity } = this.authState
      const held = isAuthenticated
        ? identity?.getPrincipal().toText()
        : undefined
      const named = (client as SubscribableAuthClient)
        .getPrincipal?.()
        ?.toText()
      if (held === undefined || held === named) {
        return undefined
      }
      return { identity: new AnonymousIdentity(), isAuthenticated: false }
    }
  }

  /** @internal Used by IdentityAttributesManager. */
  public async signInOrRecoverIdentity(
    options?: AuthClientSignInOptions
  ): Promise<Identity> {
    // Held, because `dispose()` can release it while the popup is open. The
    // recovery below then failed with a TypeError instead of the client's own
    // error.
    const client = this.authClient
    if (!client) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To use login, install the optional auth peer: npm install @icp-sdk/auth. If it is already installed and your bundler could not resolve it, pass a pre-constructed client instead: new AuthenticationManager({ clientManager, authClient: new AuthClient(...) })"
      )
    }

    try {
      return await client.signIn(
        toAuthClientSignInOptions(options, this.authClientFlavor)
      )
    } catch (error) {
      const identity = await Promise.resolve(client.getIdentity()).catch(
        () => null
      )
      const isAuthenticated = await Promise.resolve(
        client.isAuthenticated()
      ).catch(() => false)

      if (identity && this.vouchesFor(identity, isAuthenticated)) {
        return identity
      }

      throw error
    }
  }

  private ensurePreparedClient(
    options?: AuthenticationClientOptions
  ): AuthClientLike | undefined {
    if (this.authClient && !this.shouldRecreateClient(options)) {
      this.watchClient(this.authClient)
      return this.authClient
    }

    const AuthClient = this.authClientConstructor
    if (!AuthClient || this.authClientWasProvided) {
      return undefined
    }

    return this.installClient(
      new AuthClient(this.toClientOptions(options)),
      options
    )
  }

  /**
   * Hands the installed client the option shape it actually accepts.
   *
   * `authClientOptions` keeps the untranslated values, and `shouldRecreateClient`
   * compares them with the installed major in mind: two calls that differ only
   * in a key that major drops count as the same options, so the client is not
   * rebuilt for them.
   */
  private toClientOptions(options?: AuthenticationClientOptions): unknown {
    return toAuthClientConstructorOptions(
      this.authClientFlavor === "legacy"
        ? withSharedIdleCallback(options)
        : options,
      this.authClientFlavor,
      this.identityProviderPairing(options?.identityProvider),
      this.sessionAgentOptions()
    )
  }

  /**
   * Options for the agent a v9+ client mints delegations with, off mainnet.
   *
   * That client makes its own calls to the Internet Identity canister, through
   * an agent built from these options alone. Without a root key it checks every
   * certificate against mainnet's, which a local replica or testnet cannot
   * satisfy, so sign-in would fail at the first mint. Off mainnet it gets the
   * replica this app already talks to and fetches that network's root key, the
   * same trust the app's own agent needs there. When the app passed its own
   * `agentOptions.rootKey`, which its agent keeps, the minting agent gets that
   * key instead and verifies against it too. On mainnet nothing is passed, and
   * the client keeps its defaults.
   */
  private sessionAgentOptions(): Record<string, unknown> | undefined {
    if (!this.clientManager.isLocal) {
      return undefined
    }
    const host = this.clientManager.agentHost
    const rootKey = this.clientManager.explicitRootKey
    return {
      ...(host ? { host: host.toString() } : {}),
      ...(rootKey ? { rootKey } : { shouldFetchRootKey: true }),
    }
  }

  /**
   * Which canister a v9+ client should pair with `identityProvider`.
   *
   * v9+ names a provider by its authorize URL and the canister that mints its
   * delegations, and nothing about the canister follows from the URL. The
   * mainnet URL goes with mainnet's canister unless the caller named another.
   * A canister read from the `ic_env` cookie belongs to a local deployment, so
   * it never overrides that. Any other URL takes `internetIdentityId`, or the
   * well-known local canister when the URL is one IC Reactor derived for a
   * local deployment. A URL the caller set with no canister stays `unknown`.
   */
  private identityProviderPairing(
    identityProvider?: string | URL
  ): IdentityProviderPairing {
    if (String(identityProvider) === IC_INTERNET_IDENTITY_PROVIDER) {
      return this.internetIdentityIdIsExplicit && this.internetIdentityId
        ? { kind: "pair", canisterId: this.internetIdentityId }
        : { kind: "mainnet" }
    }
    if (this.internetIdentityId) {
      return { kind: "pair", canisterId: this.internetIdentityId }
    }
    if (
      identityProvider !== undefined &&
      this.isDerivedLocalProvider(identityProvider)
    ) {
      return { kind: "pair", canisterId: LOCAL_INTERNET_IDENTITY_CANISTER_ID }
    }
    return { kind: "unknown" }
  }

  /**
   * Whether `identityProvider` is a local provider IC Reactor chose, from the
   * `ic_env` cookie or built for the local replica, rather than one a caller
   * configured.
   */
  private isDerivedLocalProvider(identityProvider: string | URL): boolean {
    if (this.envIdentityProvider !== undefined) {
      return String(identityProvider) === String(this.envIdentityProvider)
    }
    if (
      this.identityProvider !== undefined ||
      !this.clientManager.isLocal ||
      this.localAuthorizePath === null
    ) {
      return false
    }
    return (
      String(identityProvider) ===
      localInternetIdentityProvider(
        Number(this.clientManager.agentHost?.port) || 4943,
        this.internetIdentityId,
        this.localAuthorizePath
      )
    )
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
    return !isSameAuthClientOptions(
      this.authClientOptions,
      options,
      this.authClientFlavor
    )
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

  /** Whether the shared agent currently signs as the anonymous principal. */
  private agentIsAnonymous(): boolean {
    const installed = this.clientManager.identity
    return installed === undefined || installed.getPrincipal().isAnonymous()
  }

  /**
   * @internal Used by IdentityAttributesManager.
   *
   * Whether the client vouches for `identity`, given what its
   * `isAuthenticated()` answered.
   *
   * A v8 client's answer is not about the identity it holds. It reads the
   * delegation expiry v8 keeps in the `localStorage` every tab shares, while
   * `getIdentity()` returns the identity this client restored or signed in
   * with, and v8 never reads storage again once it has loaded. When the session
   * lapses and the user signs in again in another tab, that tab writes a new
   * expiry, and the answer is yes again for the delegation this tab still
   * holds, which the replica refuses. So a v8 identity whose own delegation
   * has expired is not vouched for, whatever the answer. Nor is the anonymous
   * identity, which a v8 client that loaded signed out, or signed out, goes on
   * handing out once another tab signs in and the answer turns yes. It signs
   * no one in.
   *
   * A v10 client's answer is about the session it holds, and its identity
   * replaces its short-lived delegation as it ages, so the delegation it holds
   * can be past its expiry while the session is live. The answer stands alone.
   */
  public vouchesFor(
    identity: Identity | null | undefined,
    isAuthenticated: boolean
  ): boolean {
    return (
      isAuthenticated &&
      !(
        this.authClientFlavor === "legacy" &&
        (identity?.getPrincipal().isAnonymous() ||
          hasExpiredDelegation(identity))
      )
    )
  }

  /**
   * End a session the client no longer vouches for: put the anonymous
   * identity on the agent -- which also sweeps the previous user's
   * caller-scoped cache entries and refetches the rest anonymously -- and
   * publish the signed-out state.
   *
   * A v8 client is also asked to forget the session when its
   * `isAuthenticated()` answered no, since it keeps handing out the lapsed
   * delegation until `signOut()` runs. That answer reads the expiry kept in
   * the `localStorage` every tab shares, so it is no only once the session
   * stored for every tab is over, and v8's `signOut()` takes no lock and
   * revokes nothing. `signOut` failing changes nothing here: the delegation is
   * already unusable, and the agent must not keep it. When the answer was yes,
   * the delegation this tab holds lapsed under a session another tab has
   * signed in to since, and `signOut()` would delete that session from the
   * storage every tab shares. The client is left alone, and `vouchesFor()`
   * keeps the lapsed delegation it goes on handing out off the agent.
   *
   * A v10 client is left alone, as `commitSignedOut()` leaves it. Its
   * `signOut()` ends the sign-in for every tab of the origin: it takes the
   * sign-in lock from a sign-in another tab has in progress, which then fails,
   * revokes whatever session the shared store holds, and removes the record
   * every tab reads. Another tab may have signed in again since this one last
   * looked, and finding a session over is not the user asking to sign out.
   * The client already stopped vouching for the session on its own.
   *
   * @param isAuthenticated - What the client's `isAuthenticated()` answered.
   */
  private async expireSession(isAuthenticated: boolean) {
    if (this.authClientFlavor !== "session" && !isAuthenticated) {
      try {
        await this.authClient?.signOut()
      } catch {
        // Nothing to keep; fall through to anonymous either way.
      }
    }
    const identity = new AnonymousIdentity()
    this.clientManager.updateAgent(identity)
    this.updateState({
      identity,
      isAuthenticated: false,
      isAuthenticating: false,
      error: undefined,
    })
  }

  private async syncStateFromClient(revision = this.authStateRevision) {
    if (!this.authClient) {
      return
    }

    try {
      const clientIdentity = await this.authClient.getIdentity()
      const isAuthenticated = this.vouchesFor(
        clientIdentity,
        await this.authClient.isAuthenticated()
      )
      if (revision !== this.authStateRevision) {
        return
      }
      // The rule `authenticate()` applies. A caller-built client can outlive
      // the manager it was first given to, and once its session has lapsed it
      // still hands out the lapsed identity while no longer vouching for it.
      // Nothing may be signed with that.
      const identity =
        isAuthenticated || clientIdentity.getPrincipal().isAnonymous()
          ? clientIdentity
          : new AnonymousIdentity()
      this.clientManager.updateAgent(identity)
      this.updateState({
        identity,
        isAuthenticated,
        isAuthenticating: false,
        error: undefined,
      })
    } finally {
      this.markSessionChecked()
    }
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
    this.publishSession({ identity, isAuthenticated, isAuthenticating: false })
  }

  /** @internal Used by IdentityAttributesManager. */
  public setAuthenticating() {
    this.updateState({ isAuthenticating: true, error: undefined })
  }

  /** @internal Used by IdentityAttributesManager. */
  public setAuthenticationError(error: Error) {
    this.updateState({ error, isAuthenticating: false })
  }

  /** @internal Used by IdentityAttributesManager. */
  public settleAuthenticating() {
    this.updateState({ isAuthenticating: false })
  }

  /**
   * @internal Used by IdentityAttributesManager.
   *
   * Signs this manager out after the client lost its session under it, as when
   * another tab signed out. The client itself is left alone: a v10 sign-out
   * clears the storage every tab shares and takes the sign-in lock, so it would
   * also end a sign-in the other tab has made or started since.
   */
  public commitSignedOut() {
    const identity = new AnonymousIdentity()
    // As in `authenticate()`, an agent that is anonymous already is left as it
    // is: its cache holds no signed-in user's data, and re-installing it would
    // only refetch every query.
    if (!this.agentIsAnonymous()) {
      this.clientManager.updateAgent(identity)
    }
    this.publishSession({
      identity,
      isAuthenticated: false,
      isAuthenticating: false,
    })
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
      throw localInternetIdentityUnavailableError(
        canisterId,
        this.authClientFlavor
      )
    }

    return localInternetIdentityProvider(
      Number(this.clientManager.agentHost?.port) || 4943,
      this.internetIdentityId,
      this.localAuthorizePath
    )
  }

  /**
   * Publishes what a check of the session found, then marks the session
   * checked. In that order, so the auth hooks never take the state before it
   * for the answer.
   */
  private publishSession(newState: Partial<AuthState>) {
    try {
      this.updateState(newState)
    } finally {
      this.markSessionChecked()
    }
  }

  /**
   * Records a change, then tells every subscriber about it.
   *
   * Every subscriber is called even when one throws, and the first error is
   * rethrown once they all have been, so the caller still sees it. A throw
   * used to end the loop: an app's subscriber registered at module scope comes
   * before every `useAuth()`, and one that failed on a sign-in left them all
   * showing `isAuthenticating: true` while the agent signed as the user.
   *
   * A subscriber that changes the state again from its callback has told every
   * subscriber about that newer state, so the loop stops rather than deliver
   * this older one after it. The list is copied first, so a subscriber added
   * during the loop is first called for the next change. `ClientManager`
   * notifies its subscribers the same way.
   */
  private updateState(newState: Partial<AuthState>) {
    if (isDev()) console.debug("[ic-reactor] Updating Auth State:", newState)
    const revision = ++this.authStateRevision
    const state = { ...this.authStateValue, ...newState }
    this.authStateValue = state

    let failure: { error: unknown } | undefined
    for (const subscriber of [...this.authStateSubscribers]) {
      if (revision !== this.authStateRevision) break
      try {
        subscriber(state)
      } catch (error) {
        failure ??= { error }
      }
    }
    // The operation that held off `followClient()` is over: read the client
    // again, once its caller has moved on.
    const client = this.authClient
    if (
      this.clientChangedDuringOperation &&
      !this.authStateValue.isAuthenticating &&
      client
    ) {
      this.clientChangedDuringOperation = false
      void Promise.resolve()
        .then(() => this.followClient(client))
        .catch(() => undefined)
    }
    if (failure) throw failure.error
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
          this.authClientFlavor = detectAuthClientFlavor(AuthClient)
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

/**
 * Releases a client IC Reactor built and no longer uses. `dispose()` exists
 * from `@icp-sdk/auth` v9; a v8 client has nothing to release. A throw is
 * ignored: the client is being discarded either way.
 */
function disposeClient(client: AuthClientLike) {
  try {
    ;(client as { dispose?: () => void }).dispose?.()
  } catch {
    // Nothing more can be done for a client that failed to let go.
  }
}

/** The wrapper each app `onIdle` gets; see {@link withSharedIdleCallback}. */
const sharedIdleCallbacks = new WeakMap<() => unknown, () => unknown>()

/**
 * Hands every v8 client the same wrapper around the app's `idleOptions.onIdle`.
 *
 * v8's `IdleManager` is one per page. Each client registers its `onIdle` on it
 * once it signs in or restores a session, and a callback cannot be removed, so
 * a manager that rebuilt its client for per-call options ran the app's `onIdle`
 * once per client it had built on every idle period: three times after a
 * sign-in, a one-click sign-in and another sign-in (#729). The `IdleManager`
 * runs its callbacks in one synchronous loop, so the wrapper runs `onIdle` on
 * the first call of a loop and skips the calls after it. The same function
 * gets the same wrapper however many managers pass it.
 */
function withSharedIdleCallback(
  options?: AuthenticationClientOptions
): AuthenticationClientOptions | undefined {
  const onIdle = options?.idleOptions?.onIdle
  if (!onIdle) {
    return options
  }
  let shared = sharedIdleCallbacks.get(onIdle)
  if (!shared) {
    let running = false
    shared = () => {
      if (running) return undefined
      running = true
      // Cleared once the loop that called it is over, so the next idle period
      // runs `onIdle` again.
      queueMicrotask(() => {
        running = false
      })
      return onIdle()
    }
    sharedIdleCallbacks.set(onIdle, shared)
  }
  return { ...options, idleOptions: { ...options.idleOptions, onIdle: shared } }
}

/**
 * Whether `identity` signs with a delegation chain that has expired, as a
 * `DelegationIdentity` or `PartialDelegationIdentity` does once its session
 * lapses. Read by shape rather than `instanceof`, which a second copy of
 * `@icp-sdk/core` in the app would defeat.
 */
function hasExpiredDelegation(identity: Identity | null | undefined): boolean {
  const delegated = identity as
    { getDelegation?: () => DelegationChain } | null | undefined
  if (typeof delegated?.getDelegation !== "function") {
    return false
  }
  return !isDelegationValid(delegated.getDelegation())
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
    disableBrowserActivity: options.disableBrowserActivity,
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
/**
 * Whether two option sets build the same client on the installed major.
 *
 * A key that major drops cannot change the client it builds, so a difference
 * there must not cause a rebuild, which would throw away the prepared client:
 * the v8-only `storage`, `keyType`, `idleOptions` and `identity` on v10, and the
 * v10-only `disableBrowserActivity` on v8.
 */
function isSameAuthClientOptions(
  current: AuthenticationClientOptions | undefined,
  next: AuthenticationClientOptions | undefined,
  flavor: AuthClientFlavor
): boolean {
  if (current === next) {
    return true
  }
  if (!current || !next) {
    return false
  }

  const sameShared =
    String(current.identityProvider ?? "") ===
      String(next.identityProvider ?? "") &&
    current.windowOpenerFeatures === next.windowOpenerFeatures &&
    current.openIdProvider === next.openIdProvider &&
    String(current.derivationOrigin ?? "") ===
      String(next.derivationOrigin ?? "") &&
    current.transport === next.transport

  const sameForFlavor =
    flavor === "session"
      ? current.disableBrowserActivity === next.disableBrowserActivity
      : current.storage === next.storage &&
        current.keyType === next.keyType &&
        current.idleOptions === next.idleOptions &&
        current.identity === next.identity

  return sameShared && sameForFlavor
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

  // Anything able to set a cookie here can write this one, a sibling subdomain
  // or, on localhost, an app on another port. A value that is not valid
  // percent-encoding is ignored, as `safeGetCanisterEnv` ignores it: throwing
  // would fail the constructor, and every `useAuth()` render with it.
  let decodedValue: string
  try {
    decodedValue = decodeURIComponent(encodedValue)
  } catch {
    return undefined
  }

  const env = Object.fromEntries(
    decodedValue.split("&").map((entry) => {
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
    maxTimeToIdle: options.maxTimeToIdle,
    targets: options.targets,
  }
}
