import { createActorContext } from "./actor"
import { createAgentContext } from "./agent"

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
