import React from "react"
import { createAgentManager } from "@ic-reactor/core"
import { agentHooks } from "../../helpers/agentHooks"
import { authHooks } from "../../helpers/authHooks"
import { extractAgentContext } from "../../helpers/extractAgentContext"

import type {
  CreateAgentContextReturnType,
  AgentProviderProps,
  AgentContext,
  CreateAgentCotextParameters,
} from "./types"

/**
 * Creates a React context for managing IC agent and authentication states, providing hooks for interacting with the IC blockchain.
 * This function initializes an `AgentContext` with a set of utilities and hooks based on the provided agent configuration.
 *
 * @param config A partial configuration object {@link CreateAgentCotextParameters}, allowing customization of the agent's behavior.
 *
 * @returns
 * An object containing the {@link AgentProvider} component and various hooks for interacting with the agent and authentication state.
 * The {@link AgentProvider} component is a React context provider that should wrap your app or components needing access to agent functionalities.
 *
 * Usage:
 * - {@link AgentProvider}: React component to provide agent context to your application.
 * - {@link useAgent}, {@link useAuth}, {@link useAuthState},
 *   {@link useAgentState}, {@link useAgentManager}, {@link useUserPrincipal}:
 *  Hooks extracted from the created context for managing agent and authentication state within components.
 *
 * @example
 * ```tsx
 * // agent.ts
 * import { createAgentContext } from "@ic-reactor/react";
 * import { CreateAgentCotextParameters } from "@ic-reactor/react/dist/types";
 *
 * // Optional: Define custom agent configuration
 * const agentConfig: CreateAgentCotextParameters = {
 *   host: "https://localhost:8000",
 *   // or
 *   // withLocalEnv: true,
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
 *```
 * Now you can use the returned hooks in your React components
 *
 * ```tsx
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
 * the components wrapped by {@link AgentProvider}, facilitating interaction
 * with the Internet Computer blockchain.
 */
export function createAgentContext(
  config: CreateAgentCotextParameters = {}
): CreateAgentContextReturnType {
  const { disableAuthenticateOnMount: defaultDisable, ...contextOptions } =
    config
  const AgentContext = React.createContext<AgentContext | null>(null)

  const AgentProvider: React.FC<AgentProviderProps> = ({
    children,
    agentManager: mybeAgentManager,
    disableAuthenticateOnMount = defaultDisable ?? false,
    ...options
  }) => {
    const hooks = React.useMemo(() => {
      const agentManager =
        mybeAgentManager ??
        createAgentManager({ ...options, ...contextOptions })

      if (!disableAuthenticateOnMount) {
        agentManager.authenticate()
      }

      return {
        ...agentHooks(agentManager),
        ...authHooks(agentManager),
        agentManager,
      }
    }, [])

    return (
      <AgentContext.Provider value={hooks}>{children}</AgentContext.Provider>
    )
  }

  AgentProvider.displayName = "AgentProvider"

  return { AgentContext, AgentProvider, ...extractAgentContext(AgentContext) }
}
