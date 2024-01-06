import type { ActorSubclass, CreateReActorOptions } from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"

export * from "./context"

export type ReActorHooks<A extends ActorSubclass<any>> = ReturnType<
  typeof getActorHooks<A>
> &
  ReturnType<typeof getAuthHooks>

export type CreateReactorOptions = Omit<CreateReActorOptions, "isLocal">

export const createReActor = <A extends ActorSubclass<any>>(
  options: Omit<CreateReActorOptions, "isLocal">
): ReActorHooks<A> => {
  const isLocal =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" ||
      process.env.DFX_NETWORK === "local")

  const actorManager = createReActorStore<A>({
    isLocal,
    ...options,
  })

  const { useAuthClient, useAuthStore } = getAuthHooks(
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
    useMethodFields,
    useMethodField,
    useActorStore,
    useAuthStore,
    useQueryCall,
    useUpdateCall,
    useAuthClient,
  }
}
