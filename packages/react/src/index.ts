import { createReActorStore } from "@ic-reactor/core"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"
import { BaseActor, CreateReActorOptions } from "@ic-reactor/core/dist/types"

export const createReActor = <A = BaseActor>({
  isLocalEnv,
  withVisitor,
  withProcessEnv,
  ...options
}: CreateReActorOptions) => {
  isLocalEnv =
    isLocalEnv ||
    (withProcessEnv
      ? typeof process !== "undefined" &&
        (process.env.DFX_NETWORK === "local" ||
          process.env.NODE_ENV === "development")
      : false)

  const actorManager = createReActorStore<A>({
    isLocalEnv,
    withVisitor,
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
  }
}

export * as agent from "./context/agent"
export * as actor from "./context/actor"
export * as hooks from "./hooks"
export * as types from "./types"
