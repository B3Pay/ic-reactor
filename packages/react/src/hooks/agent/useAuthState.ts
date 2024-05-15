import AgentHooks from "./hooks"

/**
 * Accesses the current authentication state.
 *
 * @example
 * ```jsx
 * function AuthStateComponent() {
 *   const { authenticated, authenticating, identity, error } = useAuthState();
 *
 *   return (
 *     <div>
 *       {authenticating ? 'Authenticating...' : ''}
 *       {error ? `Error: ${error.message}` : ''}
 *       {authenticated ? `User ${identity?.getPrincipal()} is authenticated.` : 'User is not authenticated.'}
 *     </div>
 *   );
 * }
 * ```
 */
export const useAuthState = AgentHooks.useAuthState
