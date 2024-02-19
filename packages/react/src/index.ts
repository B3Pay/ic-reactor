import {
  createReActorStore,
  CreateReActorOptions,
  BaseActor,
} from "@ic-reactor/core"
import { getActorHooks } from "./hooks/actor"
import { getAuthHooks } from "./hooks/auth"

export { createReActor as createReActorCore } from "@ic-reactor/core"
export * from "@ic-reactor/core"

export * from "./context/agent"
export * from "./context/actor"
export * from "./hooks"

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
