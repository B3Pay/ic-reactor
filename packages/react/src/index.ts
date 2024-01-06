import type { ActorSubclass, CreateReActorOptions } from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"

export {
  createReActorStore,
  createAgentManager,
  createActorManager,
} from "@ic-reactor/store"

export * from "./context/agent"
export * from "./context/actor"

export type ActorHooks<A extends ActorSubclass<any>> = ReturnType<
  typeof getActorHooks<A>
> &
  ReturnType<typeof getAuthHooks>

export const createReActor = <A extends ActorSubclass<any>>({
  isLocal,
  ...options
}: CreateReActorOptions): ActorHooks<A> => {
  isLocal =
    isLocal ||
    (typeof process !== "undefined" &&
      (process.env.NODE_ENV === "development" ||
        process.env.DFX_NETWORK === "local"))

  const actorManager = createReActorStore<A>({
    isLocal,
    ...options,
  })

  const { useAuthClient, useAgentManager, useAuthStore } = getAuthHooks(
    actorManager.agentManager
  )

  const {
    useActorStore,
    useQueryCall,
    useMethodField,
    useMethodFields,
    useUpdateCall,
  } = getActorHooks(actorManager)

  return {
    useAgentManager,
    useMethodFields,
    useMethodField,
    useActorStore,
    useAuthStore,
    useQueryCall,
    useUpdateCall,
    useAuthClient,
  }
}
