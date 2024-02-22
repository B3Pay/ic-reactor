import { useContext } from "react"
import type {
  AgentManager,
  AgentContext,
  CreateAgentContextReturnType,
  UseAuthClientParameters,
} from "../types"

/**
 * This function facilitates the use of contextually provided agent functionalities,
 * such as managing the agent's state, authentication state, and user principal.
 *
 * @param agentContext A React context object of type AgentContext or null,
 * typically provided by an AgentProvider at a higher level in the component tree.
 * @returns An object containing the following hooks:
 *  - useAgent: Hook for accessing the current agent instance.
 *  - useAuthState: Hook for accessing the current authentication state.
 *  - useAgentState: Hook for accessing the current state of the agent.
 *  - useAuthClient: Hook for accessing the authentication client, optionally accepting arguments for configuration.
 *  - useAgentManager: Hook for accessing the AgentManager instance.
 *  - useUserPrincipal: Hook for accessing the user's principal.
 *
 * Each hook is designed to be used within components that are descendants of an AgentProvider,
 * ensuring access to the necessary agent-related context.
 *
 * Throws:
 *  - Error if used outside of an AgentProvider context.
 *
 * ### Integration
 *
 * To use these hooks, ensure your components are wrapped in an `AgentProvider` that you've set up to supply the `AgentContext`.
 * This context provides the necessary agent functionalities and state management capabilities required by the hooks.
 */
export const extractAgentContext = (
  agentContext: React.Context<AgentContext | null>
): Omit<CreateAgentContextReturnType, "AgentProvider"> => {
  const useAgentContext = (
    mybeAgentContext?: React.Context<AgentContext | null>
  ) => {
    const context = useContext(mybeAgentContext || agentContext)

    if (!context) {
      throw new Error("Agent hooks must be used within a AgentProvider")
    }

    return context
  }

  /**
   * Accesses the `AgentManager` instance for managing agent configurations and state.
   *
   * @example
   *```jsx
   *  function AgentManagerComponent() {
   *    const agentManager = useAgentManager();
   *
   *    // Use agentManager for managing agent configurations, etc.
   *    return <div>Agent Manager ready.</div>;
   *  }
   *```
   */
  const useAgentManager = (
    agentContext?: React.Context<AgentContext | null>
  ): AgentManager => {
    const context = useAgentContext(agentContext)

    return context.agentManager
  }

  /**
   * Accesses the current agent instance.
   *
   * @example
   *```jsx
   *  function AgentComponent() {
   *    const agent = useAgent();
   *
   *    // Use agent for interacting with the Internet Computer.
   *    return <div>Agent ready.</div>;
   *  }
   *```
   */
  const useAgent = () => useAgentContext().useAgent()

  /**
   * Accesses the current authentication state.
   *
   * @example
   * ```jsx
   * function AuthStateComponent() {
   *   const { isAuthenticated, user } = useAuthState();
   *
   *   return (
   *     <div>
   *       {isAuthenticated ? `User ${user} is authenticated.` : 'User is not authenticated.'}
   *     </div>
   *   );
   * }
   * ```
   */
  const useAuthState = () => useAgentContext().useAuthState()

  /**
   * Accesses the current state of the agent.
   *
   * @example
   * ```jsx
   * function AgentStateComponent() {
   *  const { initialized, initializing } = useAgentState();
   *
   *  return (
   *   <div>
   *    {initialized
   *      ? 'Agent is initialized.'
   *        : initializing
   *        ? 'Agent is initializing...'
   *        : 'Agent is not initialized.'}
   *   </div>
   *  );
   * }
   * ```
   */
  const useAgentState = () => useAgentContext().useAgentState()

  const useAuthClient = (args?: UseAuthClientParameters) =>
    useAgentContext().useAuthClient(args)

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
  const useUserPrincipal = () => useAgentContext().useUserPrincipal()

  return {
    useAgent,
    useAuthState,
    useAgentState,
    useAuthClient,
    useAgentManager,
    useUserPrincipal,
  }
}
