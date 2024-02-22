import { AgentHooks } from "../../agentHooks"

/**
 * Accesses the current agent instance.
 *
 * @example
 *```jsx
 *  function AgentComponent() {
 *    const agent = useAgent();
 *
 *    // Use agent for interacting with the Internet Computer.
 *    return <div>{agent.isLocal() ? 'Local' : 'Remote'}</div>;
 *  }
 *```
 */
export const useAuthState = AgentHooks.useAuthState
