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
 * @param options - Options for creating the agent manager
 * @returns AgentManager - The agent manager
 *
 *
 * @IC
 * ```ts
 * import { createAgentManager } from "@ic-reactor/store"
 *
 * const agentManager = createAgentManager() // connect to the default ic network
 *
 * const identity = await agentManager.authenticate()
 * ```
 *
 * @Local
 * ```ts
 * import { createAgentManager } from "@ic-reactor/store"
 *
 * const agentManager = createAgentManager({
 *  isLocalEnv: true,
 *  port: 8000, // default port is 4943
 * })
 * // or you can use the host option directly
 * const agentManager = createAgentManager({ host: "http://localhost:8000" })
 *
 * const identity = await agentManager.authenticate()
 * ```
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
 * @param options - Options for creating the actor manager
 * @returns ActorManager - The actor manager
 *
 * ```ts
 * import { createActorManager } from "@ic-reactor/store"
 * import { candid, canisterId, idlFactory } from "./candid"
 *
 * type Candid = typeof candid
 *
 * const actorManager = createActorManager<Candid>({
 *  idlFactory,
 *  canisterId,
 * })
 *
 * const version = actorManager.callMethod("version")
 * ```
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
 * @param {object} options - Options for creating the ReActor store.
 * @returns {ActorManager} - The actor manager.
 *
 * ```ts
 * import { createReActorStore } from "@ic-reactor/store";
 * import { candid, canisterId, idlFactory } from "./candid";
 *
 * type Candid = typeof candid;
 *
 * const { callMethod } = createReActorStore<Candid>({
 *   canisterId,
 *   idlFactory,
 * });
 *
 * const data = await callMethod("version");
 * ```
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
