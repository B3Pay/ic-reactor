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

clientManager.initialize().catch(console.error)

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(clientManager)
