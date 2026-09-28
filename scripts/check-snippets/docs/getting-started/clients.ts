// `src/clients.ts` of the getting-started pages: the module Local Development
// builds, and the one generated reactors import their `clientManager` from.
import {
  AuthenticationManager,
  ClientManager,
  createAuthHooks,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

// Network and local canister IDs come from the ic_env cookie automatically
export const clientManager = new ClientManager({ queryClient })

export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useAgentState } = createAuthHooks(authentication)
