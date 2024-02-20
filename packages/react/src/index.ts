import { createReactorStore } from "@ic-reactor/core"
import { getActorHooks } from "./helpers/actor"
import { getAuthHooks } from "./helpers/auth"
import { BaseActor, CreateReactorOptions } from "@ic-reactor/core/dist/types"
import { isInLocalOrDevelopment } from "@ic-reactor/core/dist/tools"

export const createReactor = <A = BaseActor>({
  isLocalEnv,
  withVisitor,
  withProcessEnv,
  ...options
}: CreateReactorOptions) => {
  isLocalEnv = isLocalEnv || (withProcessEnv ? isInLocalOrDevelopment() : false)

  const actorManager = createReactorStore<A>({
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

export * from "./context/agent"
export * from "./context/actor"

export * as helpers from "./helpers"
export * as hooks from "./hooks"
export * as types from "./types"
export * as core from "./core"
