import type { ActorSubclass, HttpAgentOptions } from "@dfinity/agent"
import {
  type AgentManager,
  type DefaultActorType,
  createAgentManager,
} from "@ic-reactor/store"
import { ActorCandidManager, type ActorCandidManagerOptions } from "./actor"

export * from "./actor"

export const createActorManager = <
  A extends ActorSubclass<any> = DefaultActorType
>(
  options: ActorCandidManagerOptions
): ActorCandidManager<A> => {
  return new ActorCandidManager<A>(options)
}

export interface CreateReActorOptions
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
}: ActorCandidManagerOptions): ActorCandidManager<A> => {
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
