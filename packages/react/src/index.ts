import type { ActorSubclass, CreateReActorOptions } from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { ActorHooks, getActorHooks } from "./hooks/actor"
import { AuthHooks, getAuthHooks } from "./hooks/auth"

export {
  createReActorStore,
  createAgentManager,
  createActorManager,
} from "@ic-reactor/store"

export * from "./context/agent"
export * from "./context/actor"

export const createReActor = <A extends ActorSubclass<any>>({
  isLocal,
  ...options
}: CreateReActorOptions): ActorHooks<A> & AuthHooks => {
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
    useUpdateCall,
    useMethodCall,
    useMethodField,
    useMethodFields,
    useMethodNames,
    useServiceFields,
  } = getActorHooks(actorManager)

  return {
    useAgentManager,
    useMethodFields,
    useMethodField,
    useActorStore,
    useAuthStore,
    useQueryCall,
    useUpdateCall,
    useMethodCall,
    useAuthClient,
    useMethodNames,
    useServiceFields,
  }
}
