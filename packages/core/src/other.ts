import { ActorManager } from "./actor"
import { AgentManager } from "./agent"
import { CandidAdapter } from "./candid"
import {
  ActorManagerParameters,
  AgentManagerParameters,
  BaseActor,
  CandidAdapterParameters,
} from "./types"

/**
 * The `CandidAdapter` class is used to interact with a canister and retrieve its Candid interface definition.
 * It provides methods to fetch the Candid definition either from the canister's metadata or by using a temporary hack method.
 * If both methods fail, it throws an error.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:145-186
 */
export const createCandidAdapter = (options: CandidAdapterParameters) => {
  return new CandidAdapter(options)
}

/**
 * Agent manager handles the lifecycle of the `@dfinity/agent`.
 * It is responsible for creating agent and managing the agent's state.
 * You can use it to subscribe to the agent changes.
 * login and logout to the internet identity.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:226-254
 */
export const createAgentManager = (options?: AgentManagerParameters) => {
  return new AgentManager(options)
}

/**
 * Actor manager handles the lifecycle of the actors.
 * It is responsible for creating and managing the actors.
 * You can use it to call and visit the actor's methods.
 * It also provides a way to interact with the actor's state.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:262-277
 */
export const createActorManager = <A = BaseActor>(
  options: ActorManagerParameters
) => {
  return new ActorManager<A>(options)
}
