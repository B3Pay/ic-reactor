import { type ActorSubclass, type DefaultActorType } from "@ic-reactor/store"
import { createReActorStore, CreateReActorOptions } from "@ic-reactor/store"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"
import { CreateReActor } from "./types"

export * from "@ic-reactor/store"

export * from "./context/agent"
export * from "./context/actor"

export interface CreateReactActorOptions extends CreateReActorOptions {
  withVisitor?: boolean
}

export const createReActor: CreateReActor = <
  A extends ActorSubclass<any> = DefaultActorType
>({
  isLocalEnv,
  withVisitor,
  ...options
}: CreateReactActorOptions) => {
  isLocalEnv =
    isLocalEnv ||
    (typeof process !== "undefined" &&
      (process.env.DFX_NETWORK === "local" ||
        process.env.NODE_ENV === "development"))

  let actorManager = createReActorStore<A>({
    isLocalEnv,
    ...options,
  })

  const getVisitFunction = () => {
    if (!withVisitor) {
      throw new Error(
        "Service fields not initialized. Pass `withVisitor` to initialize service fields."
      )
    }

    return actorManager.visitFunction
  }

  const getAgent = () => {
    return actorManager.agentManager.getAgent()
  }

  const actorHooks = getActorHooks<A>(actorManager)
  const authHooks = getAuthHooks(actorManager.agentManager)

  return {
    getAgent,
    getVisitFunction,
    ...actorHooks,
    ...authHooks,
  } as any
}
