import type {
  ActorSubclass,
  CreateReActorOptions,
  DefaultActorType,
} from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"
import { CreateReActor } from "./types"

export * from "@ic-reactor/store"

export * from "./context/agent"
export * from "./context/actor"

export const createReActor: CreateReActor = <
  A extends ActorSubclass<any> = DefaultActorType
>({
  isLocalEnv,
  withServiceFields,
  withServiceDetails,
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
    withServiceDetails,
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

  const getServiceDetails = () => {
    if (!withServiceDetails || !actorManager.serviceDetails) {
      throw new Error(
        "Service details not initialized. Pass `withServiceDetails` to initialize service details."
      )
    }

    return actorManager.serviceDetails
  }

  const getAgent = () => {
    return actorManager.agentManager.getAgent()
  }

  return {
    getAgent,
    getServiceFields,
    getServiceDetails,
    ...getActorHooks(actorManager),
    ...getAuthHooks(actorManager.agentManager),
  } as ReturnType<CreateReActor>
}
