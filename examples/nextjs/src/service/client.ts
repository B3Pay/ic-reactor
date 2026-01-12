import { ClientManager, createAuthHooks } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withProcessEnv: true,
  agentOptions: {
    verifyQuerySignatures: false
  }
})

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(clientManager)
