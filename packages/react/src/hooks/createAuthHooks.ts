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
 * It is the state an `AuthenticationManager` starts in. Once hydrated, React
 * compares it with the live state and renders again with that.
 */
const SERVER_AUTH_STATE: AuthState = Object.freeze({
  identity: null,
  isAuthenticating: false,
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

  /**
   * Subscribe to agent state changes.
   * Returns the current agent state (agent, isInitialized, etc.)
   */
  const useAgentState = (): AgentState =>
    useSyncExternalStore(
      (callback) => clientManager.subscribeAgentState(callback),
      () => clientManager.agentState,
      () => serverAgentState
    )

  /**
   * Subscribe to authentication state changes.
   * Returns auth state (isAuthenticated, isAuthenticating, identity, error)
   */
  const useAuthState = (): AuthState =>
    useSyncExternalStore(
      (callback) => authentication.subscribeAuthState(callback),
      () => authentication.authState,
      () => SERVER_AUTH_STATE
    )

  /**
   * Main authentication hook that provides login/logout methods and auth state.
   * Automatically initializes the session on first use, restoring any previous session.
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
        .then(() => authentication.authenticate())
        // Failures are already reflected in authState/agentState; without
        // this the rejection escapes as an unhandled promise rejection.
        .catch(() => undefined)
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
