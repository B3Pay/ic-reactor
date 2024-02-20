import { createReactorStore } from "@ic-reactor/core"
import { getActorHooks } from "./helpers/actor"
import { getAuthHooks } from "./helpers/auth"

import { isInLocalOrDevelopment } from "@ic-reactor/core/dist/tools"
import { BaseActor, CreateReactorReturn, CreateReactorOptions } from "./types"
import { getAgentHooks } from "./helpers"

export const createReactor = <A = BaseActor>(
  options: CreateReactorOptions
): CreateReactorReturn<A> => {
  const { isLocalEnv, withVisitor, withProcessEnv, ...args } = options

  const actorManager = createReactorStore<A>({
    isLocalEnv:
      isLocalEnv || (withProcessEnv ? isInLocalOrDevelopment() : false),
    withVisitor,
    ...args,
  })

  const getVisitFunction = () => {
    return actorManager.visitFunction
  }

  const getAgent = () => {
    return actorManager.agentManager.getAgent()
  }

  const actorHooks = getActorHooks(actorManager)
  const authHooks = getAuthHooks(actorManager.agentManager)
  const agentHooks = getAgentHooks(actorManager.agentManager)

  return {
    getAgent,
    getVisitFunction,
    ...agentHooks,
    ...actorHooks,
    ...authHooks,
  }
}
