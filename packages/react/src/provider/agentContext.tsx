import React, { createContext, useMemo } from "react"
import { createAgentManager } from "@ic-reactor/core"
import { getAgentHooks } from "../helpers/getAgentHooks"
import { getAuthHooks } from "../helpers/getAuthHooks"
import type { AgentManagerOptions } from "@ic-reactor/core/dist/types"
import type {
  CreateAgentContextReturn,
  AgentProviderProps,
  AgentContext,
} from "./types"
import { extractAgentContext } from "../helpers/extractAgentContext"

/**
 * Creates a React context for managing IC agent and authentication states, providing hooks for interacting with the IC blockchain.
 * This function initializes an `AgentContext` with a set of utilities and hooks based on the provided agent configuration.
 *
 * @param agentOptions A partial configuration object for the agent manager, allowing customization of the agent's behavior.
 *
 * @returns An object containing the `AgentProvider` component and various hooks for interacting with the agent and authentication state.
 * The `AgentProvider` component is a React context provider that should wrap your app or components needing access to agent functionalities.
 *
 * Usage:
 * - `AgentProvider`: React component to provide agent context to your application.
 * - `useAgent`, `useAuthClient`, `useAuthState`, `useAgentState`, `useAgentManager`, `useUserPrincipal`: Hooks extracted from the created context for managing agent and authentication state within components.
 *
 * @example:
 * ```typescript
 * // agent.ts
 * import { createAgentContext } from "@ic-reactor/react";
 * import { CreateAgentOptions } from "@ic-reactor/react/dist/types";
 *
 * // Optional: Define custom agent configuration
 * const agentConfig: CreateAgentOptions = {
 *   host: "https://localhost:8000",
 *   // or
 *   // isLocalEnv: true,
 *   // port: 8000,
 * };
 *
 * export const {
 *   AgentProvider,
 *   useAgent,
 *   useAuthClient,
 *   useAuthState,
 *   useAgentState,
 *   useAgentManager,
 *   useUserPrincipal,
 * } = createAgentContext(agentConfig);
 * ```
 *
 * This setup allows you to use the agent and authentication hooks within
 * the components wrapped by `AgentProvider` and `ActorProvider`,
 * facilitating interaction with the Internet Computer blockchain.
 */
export const createAgentContext = (
  agentOptions: Partial<AgentManagerOptions> = {}
): CreateAgentContextReturn => {
  const AgentContext = createContext<AgentContext | null>(null)

  const AgentProvider: React.FC<AgentProviderProps> = ({
    children,
    agentManager: mybeAgentManager,
    ...options
  }) => {
    const hooks = useMemo(() => {
      const agentManager =
        mybeAgentManager ?? createAgentManager({ ...options, ...agentOptions })

      return {
        ...getAgentHooks(agentManager),
        ...getAuthHooks(agentManager),
        agentManager,
      }
    }, [options])

    return (
      <AgentContext.Provider value={hooks}>{children}</AgentContext.Provider>
    )
  }

  AgentProvider.displayName = "AgentProvider"

  return { AgentProvider, ...extractAgentContext(AgentContext) }
}
