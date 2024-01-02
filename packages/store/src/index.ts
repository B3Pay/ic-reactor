import { ActorSubclass } from "@dfinity/agent"
import { ReActorManager } from "./reactor"
import { ReActorOptions } from "./types"
import { getRemoteDidJs } from "./candid/helper"

export const createReActorStore = <A extends ActorSubclass<any>>(
  reactorConfig: ReActorOptions
): ReActorManager<A> => {
  return new ReActorManager<A>({
    host: reactorConfig.isLocal
      ? "http://localhost:4943"
      : "https://icp-api.io",
    ...reactorConfig,
  })
}

export const createRemoteReActorStore = async <A extends ActorSubclass<any>>(
  reactorConfig: ReActorOptions
): Promise<ReActorManager<A>> => {
  const idlFactory = await getRemoteDidJs(reactorConfig)

  return new ReActorManager<A>({
    host: reactorConfig.isLocal
      ? "http://localhost:4943"
      : "https://icp-api.io",
    ...reactorConfig,
    idlFactory,
  })
}

export * from "./helper"
export * from "./reactor"
export * from "./types"
export * from "./candid"
