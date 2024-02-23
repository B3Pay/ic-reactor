import { AgentHooks } from "./hooks"

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
export const useAgentState = AgentHooks.useAgentState
