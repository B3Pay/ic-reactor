import type { ActorSubclass, HttpAgentOptions } from "@dfinity/agent"
import {
  type AgentManager,
  type DefaultActorType,
  createAgentManager,
} from "@ic-reactor/store"
import type { ActorCandidManagerOptions } from "./types"
import { ActorCandidManager } from "./candid"

export * from "./candid"
export * from "./types"

export const createActorManager = <
  A extends ActorSubclass<any> = DefaultActorType
>(
  options: ActorCandidManagerOptions
): ActorCandidManager<A> => {
  return new ActorCandidManager<A>(options)
}

export interface CreateReActorCandidOptions
  extends HttpAgentOptions,
    Omit<ActorCandidManagerOptions, "agentManager"> {
  agentManager?: AgentManager
  isLocalEnv?: boolean
  port?: number
}

export const createReActorCandidStore = <
  A extends ActorSubclass<any> = DefaultActorType
>({
  idlFactory,
  canisterId,
  withDevtools = false,
  initializeOnCreate = true,
  agentManager,
  ...agentOptions
}: CreateReActorCandidOptions): ActorCandidManager<A> => {
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
