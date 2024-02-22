import React, { createContext, useMemo } from "react"
import { createAgentManager } from "@ic-reactor/core"
import { agentHooks } from "../../helpers/agentHooks"
import { authHooks } from "../../helpers/authHooks"
import type { AgentManagerParameters } from "../../types"
import type {
  CreateAgentContextReturnType,
  AgentProviderProps,
  AgentContext,
} from "../types"
import { extractAgentContext } from "../../helpers/extractAgentContext"

/**
 * Creates a React context for managing IC agent and authentication states, providing hooks for interacting with the IC blockchain.
 * This function initializes an `AgentContext` with a set of utilities and hooks based on the provided agent configuration.
 *
 * @param agentParameters A partial configuration object for the agent manager, allowing customization of the agent's behavior.
 *
 * @returns An object containing the `AgentProvider` component and various hooks for interacting with the agent and authentication state.
 * The `AgentProvider` component is a React context provider that should wrap your app or components needing access to agent functionalities.
 *
 * Usage:
 * - `AgentProvider`: React component to provide agent context to your application.
 * - `useAgent`, `useAuth`, `useAuthState`, `useAgentState`, `useAgentManager`, `useUserPrincipal`: Hooks extracted from the created context for managing agent and authentication state within components.
 *
 * @example
 * ```tsx
 * // agent.ts
 * import { createAgentContext } from "@ic-reactor/react";
 * import { CreateAgentParameters } from "@ic-reactor/react/dist/types";
 *
 * // Optional: Define custom agent configuration
 * const agentConfig: CreateAgentParameters = {
 *   host: "https://localhost:8000",
 *   // or
 *   // isLocalEnv: true,
 *   // port: 8000,
 * };
 *
 * export const {
 *   AgentProvider,
 *   useAgent,
 *   useAuth,
 *   useAuthState,
 *   useAgentState,
 *   useAgentManager,
 *   useUserPrincipal,
 * } = createAgentContext(agentConfig);
 *
 * // Now you can use the returned hooks in your React components
 *
 * // App.tsx
 * import React from 'react';
 * import { AgentProvider } from './agent';
 *
 * const App = () => (
 *   <AgentProvider>
 *     <Login />
 *     <YourActor />
 *   </AgentProvider>
 * );
 *
 * const Login = () => {
 *  const { login } = useAuth()
 *  const principal = useUserPrincipal()
 *
 *  return (
 *    <div>
 *      <button onClick={() => login()}>Login</button>
 *      <p>User: {principal?.toText()}</p>
 *    </div>
 *  )
 * };
 *
 * ```
 *
 * This setup allows you to use the agent and authentication hooks within
 * the components wrapped by `AgentProvider`, facilitating interaction
 * with the Internet Computer blockchain.
 */
export const createAgentContext = (
  config: AgentManagerParameters = {}
): CreateAgentContextReturnType => {
  const AgentContext = createContext<AgentContext | null>(null)

  const AgentProvider: React.FC<AgentProviderProps> = ({
    children,
    agentManager: mybeAgentManager,
    ...options
  }) => {
    const hooks = useMemo(() => {
      const agentManager =
        mybeAgentManager ?? createAgentManager({ ...options, ...config })

      return {
        ...agentHooks(agentManager),
        ...authHooks(agentManager),
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
