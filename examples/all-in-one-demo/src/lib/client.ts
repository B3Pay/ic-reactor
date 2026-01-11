import { ClientManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

// Using withCanisterEnv to read canister IDs from the ic_env cookie
// This is the approach used by ICP CLI for passing environment variables to the frontend
export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true,
  agentOptions: {
    verifyQuerySignatures: false,
  },
})
