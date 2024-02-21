import { createAgentContext } from "./context"

export * from "./context"
export * from "./hooks"

export const {
  AgentProvider,
  useAgent,
  useAuthClient,
  useAuthState,
  useAgentState,
  useAgentManager,
  useUserPrincipal,
} = createAgentContext()
