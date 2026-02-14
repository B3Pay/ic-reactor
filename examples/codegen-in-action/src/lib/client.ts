import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/react"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true,
})

// This code is only for TypeScript
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import("@tanstack/react-query").QueryClient
  }
}

// This code is for all users
window.__TANSTACK_QUERY_CLIENT__ = queryClient
