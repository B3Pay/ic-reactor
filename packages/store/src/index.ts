import { ActorSubclass, HttpAgent, HttpAgentOptions } from "@dfinity/agent"
import { ReActorManager } from "./reactor"

const createReActorManager = <A extends ActorSubclass<any>>(
  actorInitializer: (agent: HttpAgent) => A,
  agentOptions?: HttpAgentOptions
): ReActorManager<A> => {
  return new ReActorManager<A>(actorInitializer, agentOptions)
}

export default createReActorManager
export * from "./helper"
export * from "./reactor"
export * from "./types"
