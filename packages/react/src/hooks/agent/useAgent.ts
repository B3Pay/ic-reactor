import AgentHooks from "./hooks"

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
export const useAgent = AgentHooks.useAgent
