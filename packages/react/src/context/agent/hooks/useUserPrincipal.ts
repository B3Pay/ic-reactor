import { AgentHooks } from ".."

/**
 * Accesses the user's principal.
 *
 * @example
 * ```jsx
 * function UserPrincipalComponent() {
 *   const userPrincipal = useUserPrincipal();
 *
 *   return (
 *     <div>
 *       {userPrincipal ? `User principal: ${userPrincipal}` : 'User principal not found.'}
 *     </div>
 *   );
 * }
 * ```
 */
export const useUserPrincipal = AgentHooks.useUserPrincipal
