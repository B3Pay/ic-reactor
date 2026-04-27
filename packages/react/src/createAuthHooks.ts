import { useSyncExternalStore, useEffect, useRef, useMemo } from "react"
import { ClientManager, AgentState, AuthState } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { Identity } from "@icp-sdk/core/agent"
import { AuthClientLoginOptions } from "@icp-sdk/auth/client"

export interface UseAuthReturn {
  authenticate: () => Promise<Identity | undefined>
  login: (options?: AuthClientLoginOptions) => Promise<void>
  logout: (options?: { returnTo?: string }) => Promise<void>
  isAuthenticated: boolean
  isAuthenticating: boolean
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
 * Create authentication hooks for managing user sessions with Internet Identity.
 *
 * @example
 * const { useAuth, useUserPrincipal, useAgentState } = createAuthHooks(clientManager)
 *
 * function App() {
 *   const { login, logout, principal, isAuthenticated } = useAuth()
 *
 *   return isAuthenticated
 *     ? <button onClick={logout}>Logout {principal?.toText()}</button>
 *     : <button onClick={login}>Login with II</button>
 * }
 */
export const createAuthHooks = (
  clientManager: ClientManager
): CreateAuthHooksReturn => {
  /**
   * Subscribe to agent state changes.
   * Returns the current agent state (agent, isInitialized, etc.)
   */
  const useAgentState = (): AgentState =>
    useSyncExternalStore(
      (callback) => clientManager.subscribeAgentState(callback),
      () => clientManager.agentState,
      // Server snapshot - provide initial state for SSR
      () => clientManager.agentState
    )

  /**
   * Subscribe to authentication state changes.
   * Returns auth state (isAuthenticated, isAuthenticating, identity, error)
   */
  const useAuthState = (): AuthState =>
    useSyncExternalStore(
      (callback) => clientManager.subscribeAuthState(callback),
      () => clientManager.authState,
      // Server snapshot - provide initial state for SSR
      () => clientManager.authState
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
   *     return <button onClick={logout}>Logout</button>
   *   }
   *   return (
   *     <button onClick={login} disabled={isAuthenticating}>
   *       {isAuthenticating ? "Connecting..." : "Login"}
   *     </button>
   *   )
   * }
   */
  const useAuth = (): UseAuthReturn => {
    const { login, logout, authenticate } = clientManager
    const { isAuthenticated, isAuthenticating, identity, error } =
      useAuthState()

    // Track if we've already initialized to avoid duplicate calls
    const initializedRef = useRef(false)

    // Auto-initialize on first mount to restore previous session
    useEffect(() => {
      if (!initializedRef.current) {
        initializedRef.current = true
        clientManager.initialize()
      }
    }, [])

    const principal = useMemo(
      () => (identity ? identity.getPrincipal() : null),
      [identity]
    )

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
   * Returns null if not authenticated.
   *
   * @example
   * function UserInfo() {
   *   const principal = useUserPrincipal()
   *   if (!principal) return null
   *   return <span>Logged in as: {principal.toText()}</span>
   * }
   */
  const useUserPrincipal = (): Principal | null => {
    const { identity } = useAuthState()
    return identity ? identity.getPrincipal() : null
  }

  return {
    useAuth,
    useAgentState,
    useUserPrincipal,
  }
}
