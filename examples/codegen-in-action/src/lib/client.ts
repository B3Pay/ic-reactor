import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/react"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true,
})
