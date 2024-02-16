import type { ActorManagerOptions, DefaultActorType } from "./actor/types"
import type { AgentManagerOptions } from "./agent/types"

import { ActorManager } from "./actor"
import { AgentManager } from "./agent"
import { ActorSubclass, CreateReActorOptions } from "./types"

export * from "./helper"
export * from "./types"
export * from "./actor"
export * from "./agent"
export * from "./tools"

/**
 * Create an agent manager
 *
 * @category Main Functions
 * @param {AgentManagerOptions} - Options for creating the agent manager
 * @returns {AgentManager} - The agent manager
 * @includeExample ./packages/store/README.md:54-80
 */
export const createAgentManager = (
  options?: AgentManagerOptions
): AgentManager => {
  return new AgentManager(options)
}

/**
 * Create an actor manager
 *
 * @category Main Functions
 * @param {ActorManagerOptions} - Options for creating the actor manager
 * @returns {ActorManager} - The actor manager
 * @includeExample ./packages/store/README.md:86-100
 */
export const createActorManager = <
  A extends ActorSubclass<any> = DefaultActorType
>(
  options: ActorManagerOptions
): ActorManager<A> => {
  return new ActorManager<A>(options)
}

/**
 * Create a ReActor store.
 *
 * @category Main Functions
 * @param {CreateReActorOptions} options - Options for creating the ReActor store.
 * @returns {ActorManager} - The actor manager.
 * @includeExample ./packages/store/README.md:34-46
 */
export const createReActorStore = <
  A extends ActorSubclass<any> = DefaultActorType
>(
  options: CreateReActorOptions
): ActorManager<A> => {
  const {
    idlFactory,
    canisterId,
    withDevtools = false,
    initializeOnCreate = true,
    withVisitor = false,
    agentManager: maybeAgentManager,
    ...agentOptions
  } = options

  const agentManager = maybeAgentManager || createAgentManager(agentOptions)

  const actorManager = createActorManager<A>({
    idlFactory,
    canisterId,
    agentManager,
    withVisitor,
    withDevtools,
    initializeOnCreate,
  })

  return actorManager
}
