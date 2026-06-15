import { ClientManager } from "@ic-reactor/react"
import { AuthenticationManager } from "@ic-reactor/auth"
import { createAuthHooks } from "@ic-reactor/auth-react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  agentOptions: {
    host: process.env.NEXT_PUBLIC_IC_HOST || "http://127.0.0.1:4943"
  }
})
export const authentication = new AuthenticationManager({ clientManager })

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)
