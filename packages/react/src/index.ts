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
  isLocalEnv,
  ...options
}: CreateReActorOptions): ActorHooks<A> & AuthHooks => {
  isLocalEnv =
    isLocalEnv ||
    (typeof process !== "undefined" &&
      (process.env.NODE_ENV === "development" ||
        process.env.DFX_NETWORK === "local"))

  const actorManager = createReActorStore<A>({
    isLocalEnv,
    ...options,
  })

  const { useAuthClient, useAgentManager, useAuthStore } = getAuthHooks(
    actorManager.agentManager
  )

  const {
    initialize,
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
    initialize,
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
