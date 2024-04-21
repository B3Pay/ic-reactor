import { AgentManager } from "./classes/agent"

import type { AgentManagerParameters } from "./types"

/**
 * Agent manager handles the lifecycle of the `@dfinity/agent`.
 * It is responsible for creating agent and managing the agent's state.
 * You can use it to subscribe to the agent changes.
 * login and logout to the internet identity.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:232-260
 */
export const createAgentManager = (config?: AgentManagerParameters) => {
  return new AgentManager(config)
}
