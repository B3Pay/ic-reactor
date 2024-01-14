import type {
  IDL,
  ActorSubclass,
  CanisterId,
  ActorManagerOptions,
} from "./actor/types"
import type { AgentManagerOptions, HttpAgentOptions } from "./agent/types"

import { ActorManager } from "./actor"
import { AgentManager } from "./agent"

export * from "./helper"
export * from "./actor"
export * from "./agent"

export const createAgentManager = ({
  port = 4943,
  isLocalEnv,
  ...options
}: AgentManagerOptions): AgentManager => {
  const host = isLocalEnv
    ? `http://127.0.0.1:${port}`
    : options.host
    ? options.host.includes("localhost")
      ? options.host.replace("localhost", "127.0.0.1")
      : options.host
    : "https://icp-api.io"

  return new AgentManager({
    host,
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
  isLocalEnv?: boolean
  port?: number
  initializeOnCreate?: boolean
}

export const createReActorStore = <A extends ActorSubclass<any>>({
  port,
  idlFactory,
  canisterId,
  withDevtools = false,
  isLocalEnv = false,
  initializeOnCreate = true,
  ...options
}: CreateReActorOptions): ActorManager<A> => {
  const agentManager =
    options.agentManager ||
    createAgentManager({
      isLocalEnv,
      withDevtools,
      port,
      ...options,
    })

  return createActorManager<A>({
    idlFactory,
    canisterId,
    agentManager,
    withDevtools,
    initializeOnCreate,
  })
}
