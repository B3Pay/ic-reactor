import {
  createReActorStore,
  type ActorSubclass,
  type DefaultActorType,
} from "@ic-reactor/store"
import {
  createReActorCandidStore,
  CreateReActorCandidOptions,
  ActorCandidManager,
} from "@ic-reactor/candid"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"
import { CreateReActor } from "./types"

export * from "./context/agent"
export * from "./context/actor"

export interface CreateReactActorOptions extends CreateReActorCandidOptions {
  withServiceFields?: boolean
  withServiceDetails?: boolean
}

export const createReActor: CreateReActor = <
  A extends ActorSubclass<any> = DefaultActorType
>({
  isLocalEnv,
  withServiceFields,
  withServiceDetails,
  ...options
}: CreateReactActorOptions) => {
  isLocalEnv =
    isLocalEnv ||
    (typeof process !== "undefined" &&
      (process.env.DFX_NETWORK === "local" ||
        process.env.NODE_ENV === "development"))

  let actorManager: ActorCandidManager<A>

  if (withServiceFields || withServiceDetails) {
    actorManager = createReActorCandidStore<A>({
      isLocalEnv,
      ...options,
    })
  } else {
    actorManager = createReActorStore<A>({
      isLocalEnv,
      ...options,
    }) as unknown as ActorCandidManager<A>
  }

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

  const actorHooks = getActorHooks<A>(actorManager)
  const authHooks = getAuthHooks(actorManager.agentManager)

  return {
    getAgent,
    getServiceFields,
    getServiceDetails,
    ...actorHooks,
    ...authHooks,
  } as any
}
