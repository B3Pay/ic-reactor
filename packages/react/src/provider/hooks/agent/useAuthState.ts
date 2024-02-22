import { AgentHooks } from "../../agentHooks"

/**
 * Accesses the current authentication state.
 *
 * @example
 * ```jsx
 * function AuthStateComponent() {
 *   const { isAuthenticated, authenticating, identity, error } = useAuthState();
 *
 *   return (
 *     <div>
 *       {authenticating ? 'Authenticating...' : ''}
 *       {error ? `Error: ${error.message}` : ''}
 *       {isAuthenticated ? `User ${identity?.getPrincipal()} is authenticated.` : 'User is not authenticated.'}
 *     </div>
 *   );
 * }
 * ```
 */
export const useAuthState = AgentHooks.useAuthState
