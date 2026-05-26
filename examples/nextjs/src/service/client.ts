import { ClientManager } from "@ic-reactor/react"
import { AuthenticationManager } from "@ic-reactor/auth"
import { createAuthHooks } from "@ic-reactor/auth-react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withProcessEnv: true,
  agentOptions: {
    verifyQuerySignatures: false
  }
})
export const authentication = new AuthenticationManager({ clientManager })

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)
