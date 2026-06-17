import { ClientManager } from "@ic-reactor/react"
import { AuthenticationManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { createAuthHooks } from "@ic-reactor/react"

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
  queryClient,
})
export const authentication = new AuthenticationManager({
  clientManager,
})

export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
