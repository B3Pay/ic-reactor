import { ActorSubclass, HttpAgentOptions } from "@dfinity/agent"
import { ActorManager } from "./reactor"
import { CanisterId } from "./types"
import { InterfaceFactory } from "@dfinity/candid/lib/cjs/idl"
import AgentManager from "./agent"

export interface CreateReActorConfig extends HttpAgentOptions {
  idlFactory: InterfaceFactory
  canisterId: CanisterId
  withDevtools?: boolean
  isLocal?: boolean
}
export type CreateReActorStore<A> = {
  actorManager: ActorManager<A>
  agentManager: AgentManager
}

export const createReActorStore = <A extends ActorSubclass<any>>({
  idlFactory,
  canisterId,
  withDevtools = false,
  isLocal = false,
  ...agentOptions
}: CreateReActorConfig): CreateReActorStore<A> => {
  const agentManager = new AgentManager({
    host: isLocal ? "http://localhost:4943" : "https://icp-api.io",
    withDevtools,
    ...agentOptions,
  })

  const actorManager = new ActorManager<A>({
    idlFactory,
    canisterId,
    withDevtools,
    agentManager,
  })

  return {
    agentManager,
    actorManager,
  }
}

export * from "./helper"
export * from "./reactor"
export * from "./types"
export * from "./candid"
