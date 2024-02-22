import { AgentHooks } from "../../agentHooks"

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
export const useAgentManager = AgentHooks.useAgentManager
