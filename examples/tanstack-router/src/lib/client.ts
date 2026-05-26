import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "@ic-reactor/auth"
import { QueryClient } from "@tanstack/react-query"
import { createAuthHooks } from "@ic-reactor/auth-react"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
})

// @ts-ignore
window.__TANSTACK_QUERY_CLIENT__ = queryClient

export const clientManager = new ClientManager({
  withProcessEnv: true,
  queryClient,
})
export const authentication = new AuthenticationManager({ clientManager })

export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
