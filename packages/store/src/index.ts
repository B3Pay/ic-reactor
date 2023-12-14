import { ActorSubclass, HttpAgent } from "@dfinity/agent"
import { ReActorManager } from "./reactor"
import { ReActorOptions } from "./types"

export const createReActorStore = <A extends ActorSubclass<any>>(
  actorInitializer: (agent: HttpAgent) => A,
  reactorConfig?: ReActorOptions
): ReActorManager<A> => {
  return new ReActorManager<A>(actorInitializer, reactorConfig)
}

export * from "./helper"
export * from "./reactor"
export * from "./types"
