import { createActorManager, createAgentManager } from "./other"
import { ActorManager } from "./actor"
import type { BaseActor, CreateReactorStoreOptions } from "./types"

/**
 * Create a new actor manager with the given options.
 * Its create a new agent manager if not provided.
 * It also creates a new actor manager with the given options.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:194-220
 */
export const createReactorStore = <A = BaseActor>(
  options: CreateReactorStoreOptions
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

  const agentManager =
    maybeAgentManager ||
    createAgentManager({
      withDevtools,
      ...agentOptions,
    })

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
