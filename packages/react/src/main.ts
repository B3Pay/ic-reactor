import { createReactorStore } from "@ic-reactor/core"
import { getActorHooks } from "./helpers/actor"
import { getAuthHooks } from "./helpers/auth"

import { isInLocalOrDevelopment } from "@ic-reactor/core/dist/tools"
import { CreateReactor } from "./types"
import { getAgentHooks } from "./helpers"

export const createReactor: CreateReactor = (options) => {
  const { isLocalEnv, withVisitor, withProcessEnv, ...args } = options

  const actorManager = createReactorStore({
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
