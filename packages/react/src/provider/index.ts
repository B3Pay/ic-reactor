import { createActorContext } from "./actorContext"
import { createAgentContext } from "./agentContext"

export const {
  ActorProvider,
  useActorState,
  useQueryCall,
  useUpdateCall,
  useVisitMethod,
} = createActorContext()

export { createActorContext }

export const {
  AgentProvider,
  useAgent,
  useAuthClient,
  useAuthState,
  useAgentState,
  useAgentManager,
  useUserPrincipal,
} = createAgentContext()

export { createAgentContext }

export * from "./hooks"
