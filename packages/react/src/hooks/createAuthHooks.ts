import { useSyncExternalStore, useEffect, useRef, useMemo } from "react"
import type { AuthenticationManager } from "../auth/authentication-manager.js"
import type { AuthState, AuthenticationSignInOptions } from "../auth/types.js"
import type { AgentState } from "@ic-reactor/core"
import type { Principal } from "@icp-sdk/core/principal"
import type { Identity } from "@icp-sdk/core/agent"

export interface UseAuthReturn {
  authenticate: () => Promise<Identity | undefined>
  login: (options?: AuthenticationSignInOptions) => Promise<void>
  logout: (options?: { returnTo?: string }) => Promise<void>
  isAuthenticated: boolean
  /**
   * `true` while a sign-in or sign-out is in progress, and until the session
   * restore the first `useAuth()` starts has settled: on the first render, in
   * a server render and while the stored session is read. A restore that fails
   * settles it too. Show a loading state while it is `true` rather than
   * treating `isAuthenticated: false` as signed out.
   */
  isAuthenticating: boolean
  /**
   * The signed-in user's principal, or `null` while signed out. A signed-out
   * session still holds an anonymous `identity`, and its principal is not
   * returned here.
   */
  principal: Principal | null
  identity: Identity | null
  error: Error | undefined
}

export interface CreateAuthHooksReturn {
  useAgentState: () => AgentState
  useUserPrincipal: () => Principal | null
  useAuth: () => UseAuthReturn
}

/**
 * The managers whose session a `useAuth()` has already started restoring.
 *
 * Restoring ends in `authenticate()`, which publishes `isAuthenticating: true`
 * and then the restored state. It used to run once per mounted `useAuth()`
 * rather than once per manager, so every consumer that mounted while signed out
 * flipped `isAuthenticating` for the whole app, and one that mounted while a
 * sign-in popup was open cleared `isAuthenticating` before the sign-in ended. A
 * component that hides a `useAuth()` consumer while `isAuthenticating` never
 * settled: each restore unmounted the consumer, and each remount restored
 * again. Both clients answer from memory once loaded, so that loop ran on the
 * microtask queue and the page never painted again.
 *
 * Keyed by manager rather than by `createAuthHooks` call, because reactors that
 * share one `AuthenticationManager` each build their own hooks.
 */
const restoredSessions = new WeakSet<AuthenticationManager>()

/**
 * The principal both hooks return.
 *
 * `authenticate()` and `logout()` leave the client's anonymous identity in
 * `authState.identity` with `isAuthenticated: false`, so deriving the principal
 * from the identity alone reported `2vxsx-fae` for a signed-out user, and
 * `principal ? <SignedIn /> : <SignedOut />` rendered the signed-in branch.
 * Memoized on the identity, because `getPrincipal()` may build a new object on
 * each call and the result is often a hook dependency.
 */
function usePrincipal(
  isAuthenticated: boolean,
  identity: Identity | null
): Principal | null {
  return useMemo(
    () => (isAuthenticated && identity ? identity.getPrincipal() : null),
    [isAuthenticated, identity]
  )
}

/**
 * The auth state a server render shows, and so the one hydration shows.
 *
 * `useSyncExternalStore` renders `getServerSnapshot` on the server and again
 * while hydrating, and both renders have to produce the HTML the server sent.
 * The hooks passed the live state for both. A server holds no session, so its
 * HTML is signed out. A component that hydrates after the session is restored,
 * such as one inside a Suspense boundary whose code arrives later, read the
 * restored state and no longer matched that HTML. React then reported a
 * hydration error and threw the boundary's server HTML away to render it again
 * on the client. A constant also keeps a server render from showing whatever a
 * manager shared across requests happens to hold.
 *
 * It is the state the hooks report before the session has been checked: a
 * server cannot know the session, so it renders the "checking" state that a
 * browser shows until its restore settles. Once hydrated, React compares it
 * with the live state and renders again with that.
 */
const SERVER_AUTH_STATE: AuthState = Object.freeze({
  identity: null,
  isAuthenticating: true,
  isAuthenticated: false,
  error: undefined,
})

/**
 * Create authentication hooks for managing user sessions with Internet Identity.
 *
 * @example
 * const { useAuth, useUserPrincipal, useAgentState } = createAuthHooks(authentication)
 *
 * function App() {
 *   const { login, logout, principal, isAuthenticated } = useAuth()
 *
 *   return isAuthenticated
 *     ? <button onClick={() => logout()}>Logout {principal?.toText()}</button>
 *     : <button onClick={() => login()}>Login with II</button>
 * }
 */
export const createAuthHooks = (
  authentication: AuthenticationManager
): CreateAuthHooksReturn => {
  // Passing a ClientManager here is the natural mistake — it is what
  // `AuthenticationManager` is built from, and the two are adjacent in every
  // setup snippet. TypeScript rejects it, but a JS caller got no error until
  // render, where it surfaced as "Cannot destructure property 'isAuthenticated'
  // of 'useAuthState(...)' as it is undefined" — which names neither the cause
  // nor this function.
  if (
    !authentication ||
    typeof authentication.subscribeAuthState !== "function"
  ) {
    throw new TypeError(
      "[ic-reactor] createAuthHooks() expects an AuthenticationManager, not a " +
        "ClientManager. Build one first: " +
        "`new AuthenticationManager({ clientManager })`, or take it from " +
        "`defineReactor(...).authentication`."
    )
  }

  const { clientManager } = authentication

  // The agent state a manager starts in, for the reason given at
  // SERVER_AUTH_STATE: `useAuth()` initializes the agent once hydrated, so a
  // component hydrating later read `isInitialized: true` against server HTML
  // rendered before any initialization. The network is kept: it comes from the
  // agent's host, which initialization does not change.
  const serverAgentState: AgentState = Object.freeze({
    isInitialized: false,
    isInitializing: false,
    error: undefined,
    network: clientManager.network,
    isLocalhost: clientManager.isLocal,
  })

  // What every consumer hands `useSyncExternalStore`, built once rather than
  // on each render. React unsubscribes and subscribes again whenever the
  // subscribe function changes, and each unsubscribe filters the manager's
  // whole subscriber list. An auth state change re-renders every consumer, so
  // a function per render cost k re-subscriptions and about k²/2 subscriber
  // visits for k consumers: two million for 2,000 `useUserPrincipal()` rows.
  const subscribeAgentState = (callback: () => void) =>
    clientManager.subscribeAgentState(callback)
  const getAgentState = () => clientManager.agentState
  const getServerAgentState = () => serverAgentState

  // Until the session has been checked, `authState` is the signed-out state
  // the manager starts in, and reporting it as the answer sent signed-in users
  // to the login page (#621). `useAuth()` starts the check from an effect, so
  // on the first render nothing had been checked, yet `isAuthenticating` was
  // false: a guard that redirects when `!isAuthenticating && !isAuthenticated`
  // redirected before the session was ever read. The hooks report
  // `isAuthenticating: true` until the check settles instead. The snapshot is
  // kept per source state, because `useSyncExternalStore` needs the same object
  // back until something changes.
  let unchecked: { source: AuthState; state: AuthState } | undefined
  const subscribeAuthState = (callback: () => void) => {
    const unsubscribeState = authentication.subscribeAuthState(callback)
    const unsubscribeChecked = authentication.subscribeSessionChecked(callback)
    return () => {
      unsubscribeState()
      unsubscribeChecked()
    }
  }
  const getAuthState = () => {
    const state = authentication.authState
    if (authentication.sessionChecked || state.isAuthenticating) return state
    if (unchecked?.source !== state) {
      unchecked = {
        source: state,
        state: Object.freeze({ ...state, isAuthenticating: true }),
      }
    }
    return unchecked.state
  }
  const getServerAuthState = () => SERVER_AUTH_STATE

  /**
   * Subscribe to agent state changes.
   * Returns the current agent state (agent, isInitialized, etc.)
   */
  const useAgentState = (): AgentState =>
    useSyncExternalStore(
      subscribeAgentState,
      getAgentState,
      getServerAgentState
    )

  /**
   * Subscribe to authentication state changes.
   * Returns auth state (isAuthenticated, isAuthenticating, identity, error)
   */
  const useAuthState = (): AuthState =>
    useSyncExternalStore(subscribeAuthState, getAuthState, getServerAuthState)

  /**
   * Main authentication hook that provides login/logout methods and auth state.
   * Automatically initializes the session on first use, restoring any previous session.
   *
   * `isAuthenticating` is `true` until that restore has settled, including on
   * the first render and in a server render, so a guard that shows a spinner
   * while `isAuthenticating` never takes the state before the restore for a
   * signed-out user. A restore that fails settles it too.
   *
   * @example
   * function AuthButton() {
   *   const { login, logout, isAuthenticated, isAuthenticating } = useAuth()
   *
   *   if (isAuthenticated) {
   *     return <button onClick={() => logout()}>Logout</button>
   *   }
   *   return (
   *     <button onClick={() => login()} disabled={isAuthenticating}>
   *       {isAuthenticating ? "Connecting..." : "Login"}
   *     </button>
   *   )
   * }
   */
  const useAuth = (): UseAuthReturn => {
    const { login, logout, authenticate } = authentication
    const { isAuthenticated, isAuthenticating, identity, error } =
      useAuthState()

    // Keeps a StrictMode re-run of the effect below from repeating it.
    const initializedRef = useRef(false)

    // Restore the previous session when the first consumer of this manager
    // mounts. `prepareClient` also warms up the AuthClient so a later
    // `login()` can open the identity provider window inside the click handler.
    useEffect(() => {
      if (initializedRef.current) return
      initializedRef.current = true

      if (restoredSessions.has(authentication)) {
        // Restored already. A live session is still checked again, which
        // notices a delegation that has lapsed since and publishes nothing
        // while it is valid.
        if (authentication.authState.isAuthenticated) {
          authentication.authenticate().catch(() => undefined)
        }
        return
      }
      restoredSessions.add(authentication)

      authentication
        .prepareClient()
        .catch(() => undefined)
        .then(() => clientManager.initialize())
        .then(() => {
          // A check that has settled already and found no session, such as
          // the one a manager runs over a client handed to its constructor,
          // or a route loader's `authenticate()`, answered what this restore
          // would. Running it again only flashed `isAuthenticating`, and a
          // guard redirected a second time. A live session is still checked,
          // which publishes nothing while it is valid.
          const { isAuthenticated, error } = authentication.authState
          if (authentication.sessionChecked && !isAuthenticated && !error) {
            return undefined
          }
          return authentication.authenticate()
        })
        // Failures are already reflected in authState/agentState; without
        // this the rejection escapes as an unhandled promise rejection.
        .catch(() => undefined)
        // A restore that failed before it reached `authenticate()`, such as a
        // root key that could not be fetched, has settled all the same.
        .finally(() => authentication.markSessionChecked())
    }, [])

    const principal = usePrincipal(isAuthenticated, identity)

    return {
      authenticate,
      login,
      logout,
      isAuthenticated,
      isAuthenticating,
      principal,
      identity,
      error,
    }
  }

  /**
   * Get the current user's Principal.
   * Returns null if not authenticated, including while the signed-out session
   * holds the anonymous identity.
   *
   * @example
   * function UserInfo() {
   *   const principal = useUserPrincipal()
   *   if (!principal) return null
   *   return <span>Logged in as: {principal.toText()}</span>
   * }
   */
  const useUserPrincipal = (): Principal | null => {
    const { isAuthenticated, identity } = useAuthState()
    return usePrincipal(isAuthenticated, identity)
  }

  return {
    useAuth,
    useAgentState,
    useUserPrincipal,
  }
}
