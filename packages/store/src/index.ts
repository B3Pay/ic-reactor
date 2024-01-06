import type {
  IDL,
  ActorSubclass,
  CanisterId,
  ActorActions,
  ActorManagerOptions,
} from "./actor/types"
import type {
  AgentActions,
  AgentManagerOptions,
  HttpAgentOptions,
} from "./agent/types"

import { ActorManager } from "./actor"
import { AgentManager } from "./agent"

export * from "./helper"
export * from "./actor"
export * from "./agent"

export const createAgentManager = ({
  isLocal,
  ...options
}: AgentManagerOptions): AgentManager => {
  return new AgentManager({
    host: isLocal ? "http://localhost:4943" : "https://icp-api.io",
    ...options,
  })
}

export const createActorManager = <A extends ActorSubclass<any>>(
  options: ActorManagerOptions
): ActorManager<A> => {
  return new ActorManager<A>(options)
}

export interface CreateReActorOptions extends HttpAgentOptions {
  agentManager?: AgentManager
  idlFactory: IDL.InterfaceFactory
  canisterId: CanisterId
  withDevtools?: boolean
  isLocal?: boolean
}

export const createReActorStore = <A extends ActorSubclass<any>>({
  idlFactory,
  canisterId,
  withDevtools = false,
  isLocal = false,
  ...options
}: CreateReActorOptions): ActorManager<A> => {
  const agentManager =
    options.agentManager ||
    createAgentManager({
      isLocal,
      withDevtools,
      ...options,
    })

  return createActorManager<A>({
    idlFactory,
    canisterId,
    agentManager,
    withDevtools,
  })
}
