import type {
  ActorSubclass,
  ActorManagerOptions,
  DefaultActorType,
} from "./actor/types"
import type { AgentManagerOptions, HttpAgentOptions } from "./agent/types"

import { ActorManager } from "./actor"
import { AgentManager } from "./agent"

export * from "./helper"
export * from "./actor"
export * from "./agent"
export * from "./tools"

export const createAgentManager = (
  options: AgentManagerOptions
): AgentManager => {
  return new AgentManager(options)
}

export const createActorManager = <
  A extends ActorSubclass<any> = DefaultActorType
>(
  options: ActorManagerOptions
): ActorManager<A> => {
  return new ActorManager<A>(options)
}

export interface CreateReActorOptions
  extends HttpAgentOptions,
    Omit<ActorManagerOptions, "agentManager"> {
  agentManager?: AgentManager
  isLocalEnv?: boolean
  port?: number
}

export const createReActorStore = <
  A extends ActorSubclass<any> = DefaultActorType
>({
  idlFactory,
  canisterId,
  withDevtools = false,
  initializeOnCreate = true,
  agentManager,
  ...agentOptions
}: CreateReActorOptions): ActorManager<A> => {
  return createActorManager<A>({
    idlFactory,
    canisterId,
    agentManager:
      agentManager ||
      createAgentManager({
        withDevtools,
        ...agentOptions,
      }),
    withDevtools,
    initializeOnCreate,
  })
}
