import React from "react"

import type {
  AgentManager,
  AgentContext,
  CreateAgentContextReturnType,
  UseAuthParameters,
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
 *  - useAuth: Hook for accessing the authentication client, optionally accepting arguments for configuration.
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
  const useAgentContext = () => {
    const context = React.useContext(agentContext)

    if (!context) {
      throw new Error("Agent hooks must be used within a AgentProvider")
    }

    return context
  }

  const useAgentManager = (): AgentManager => {
    const context = useAgentContext()

    return context.agentManager
  }

  const useAgent = () => useAgentContext().useAgent()

  const useAuthState = () => useAgentContext().useAuthState()

  const useAgentState = () => useAgentContext().useAgentState()

  const useAuth = (args?: UseAuthParameters) => useAgentContext().useAuth(args)

  const useUserPrincipal = () => useAgentContext().useUserPrincipal()

  return {
    useAgent,
    useAuthState,
    useAgentState,
    useAuth,
    useAgentManager,
    useUserPrincipal,
  }
}
