import type { ActorManagerOptions, DefaultActorType } from "./actor/types"
import type { AgentManagerOptions } from "./agent/types"

import { ActorManager } from "./actor"
import { AgentManager } from "./agent"
import { ActorSubclass, CreateReActorOptions } from "./types"
import { CandidAdapter, CandidAdapterOptions } from "./tools"

export * from "./helper"
export * from "./types"
export * from "./actor"
export * from "./agent"
export * from "./tools"

/**
 * Agent manager handles the lifecycle of the @dfinity/agent.
 * It is responsible for creating agent and managing the agent's state.
 * You can use it to subscribe to the agent changes.
 * login and logout to the internet identity.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:57-87
 */
export const createAgentManager = (
  options?: AgentManagerOptions
): AgentManager => {
  return new AgentManager(options)
}

/**
 * Actor manager handles the lifecycle of the actors.
 * It is responsible for creating and managing the actors.
 * You can use it to call and visit the actor's methods.
 * It also provides a way to interact with the actor's state.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:95-112
 */
export const createActorManager = <
  A extends ActorSubclass<any> = DefaultActorType
>(
  options: ActorManagerOptions
): ActorManager<A> => {
  return new ActorManager<A>(options)
}

/**
 * Create a new actor manager with the given options.
 * Its create a new agent manager if not provided.
 * It also creates a new actor manager with the given options.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:32-47
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

/**
 * The `CandidAdapter` class is used to interact with a canister and retrieve its Candid interface definition.
 * It provides methods to fetch the Candid definition either from the canister's metadata or by using a temporary hack method.
 * If both methods fail, it throws an error.
 *
 * @category Main
 * @includeExample ./packages/store/README.md:175-188
 */
export const createCandidAdapter = (options: CandidAdapterOptions) => {
  return new CandidAdapter(options)
}
