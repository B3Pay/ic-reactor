import { ClientManager } from "@ic-reactor/core"
import { createAuthHooks } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
    },
  },
})

export const clientManager = new ClientManager({
  withProcessEnv: true,
  queryClient,
})

export const { useAuth, useIdentityAttributes, useUserPrincipal } =
  createAuthHooks(clientManager)
