import type { ActorSubclass, CreateReActorOptions } from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"
import { CreateReActor } from "./types"

export * from "@ic-reactor/store"

export * from "./context/agent"
export * from "./context/actor"

export const createReActor: CreateReActor = <A extends ActorSubclass<any>>({
  isLocalEnv,
  withServiceFields,
  ...options
}: CreateReActorOptions) => {
  isLocalEnv =
    isLocalEnv ||
    (typeof process !== "undefined" &&
      (process.env.DFX_NETWORK === "local" ||
        process.env.NODE_ENV === "development"))

  const actorManager = createReActorStore<A>({
    isLocalEnv,
    withServiceFields,
    ...options,
  })

  const getServiceFields = () => {
    if (!withServiceFields || !actorManager.serviceFields) {
      throw new Error(
        "Service fields not initialized. Pass `withServiceFields` to initialize service fields."
      )
    }

    return actorManager.serviceFields
  }

  const getAgent = () => {
    return actorManager.agentManager.getAgent()
  }

  return {
    getAgent,
    getServiceFields,
    ...getActorHooks(actorManager),
    ...getAuthHooks(actorManager.agentManager),
  } as any
}
