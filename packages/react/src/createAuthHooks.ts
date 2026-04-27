import {
  useSyncExternalStore,
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
} from "react"
import {
  ClientManager,
  AgentState,
  AuthState,
  ClientManagerSignInOptions,
  IdentityAttributeResult,
  RequestIdentityAttributesParameters,
  RequestOpenIdIdentityAttributesParameters,
} from "@ic-reactor/core"
import type { Principal } from "@icp-sdk/core/principal"
import type { Identity } from "@icp-sdk/core/agent"

export interface UseAuthReturn {
  authenticate: () => Promise<Identity | undefined>
  login: (options?: ClientManagerSignInOptions) => Promise<void>
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
  useIdentityAttributes: () => UseIdentityAttributesReturn
}

export interface UseIdentityAttributesReturn {
  requestAttributes: (
    params: RequestIdentityAttributesParameters
  ) => Promise<IdentityAttributeResult>
  requestOpenIdAttributes: (
    params: RequestOpenIdIdentityAttributesParameters
  ) => Promise<IdentityAttributeResult>
  attributes: IdentityAttributeResult | null
  isRequestingAttributes: boolean
  attributeError: Error | null
  clearAttributes: () => void
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

  const useIdentityAttributes = (): UseIdentityAttributesReturn => {
    const [attributes, setAttributes] =
      useState<IdentityAttributeResult | null>(null)
    const [isRequestingAttributes, setIsRequestingAttributes] = useState(false)
    const [attributeError, setAttributeError] = useState<Error | null>(null)

    const requestAttributes = useCallback(
      async (params: RequestIdentityAttributesParameters) => {
        setIsRequestingAttributes(true)
        setAttributeError(null)
        try {
          const result = await clientManager.requestIdentityAttributes(params)
          setAttributes(result)
          return result
        } catch (error) {
          setAttributeError(error as Error)
          throw error
        } finally {
          setIsRequestingAttributes(false)
        }
      },
      []
    )

    const requestOpenIdAttributes = useCallback(
      async (params: RequestOpenIdIdentityAttributesParameters) => {
        setIsRequestingAttributes(true)
        setAttributeError(null)
        try {
          const result =
            await clientManager.requestOpenIdIdentityAttributes(params)
          setAttributes(result)
          return result
        } catch (error) {
          setAttributeError(error as Error)
          throw error
        } finally {
          setIsRequestingAttributes(false)
        }
      },
      []
    )

    const clearAttributes = useCallback(() => {
      setAttributes(null)
      setAttributeError(null)
    }, [])

    return {
      requestAttributes,
      requestOpenIdAttributes,
      attributes,
      isRequestingAttributes,
      attributeError,
      clearAttributes,
    }
  }

  return {
    useAuth,
    useAgentState,
    useUserPrincipal,
    useIdentityAttributes,
  }
}
