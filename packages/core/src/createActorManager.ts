import { ActorManager } from "./classes/actor"

import type { ActorManagerParameters, BaseActor } from "./types"

/**
 * Actor manager handles the lifecycle of the actors.
 * It is responsible for creating and managing the actors.
 * You can use it to call and visit the actor's methods.
 * It also provides a way to interact with the actor's state.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:268-283
 */
export const createActorManager = <A = BaseActor>(
  config: ActorManagerParameters
) => {
  return new ActorManager<A>(config)
}
