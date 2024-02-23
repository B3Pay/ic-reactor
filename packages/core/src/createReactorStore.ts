import { ActorManager } from "./classes/actor"
import type { BaseActor, CreateReactorStoreParameters } from "./types"
import { isInLocalOrDevelopment } from "./utils"
import { createActorManager } from "./createActorManager"
import { createAgentManager } from "./createAgentManager"

/**
 * Create a new actor manager with the given options.
 * Its create a new agent manager if not provided.
 * It also creates a new actor manager with the given options.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:194-220
 */
export const createReactorStore = <A = BaseActor>(
  config: CreateReactorStoreParameters
): ActorManager<A> => {
  const isLocalEnv = config.withProcessEnv
    ? isInLocalOrDevelopment()
    : undefined

  const {
    idlFactory,
    canisterId,
    withDevtools = false,
    initializeOnCreate = true,
    withVisitor = false,
    agentManager: maybeAgentManager,
    ...agentParameters
  } = config

  const agentManager =
    maybeAgentManager ||
    createAgentManager({
      withDevtools,
      isLocalEnv,
      ...agentParameters,
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
