// `src/clients.ts`, the module codegen's generated reactors import their
// `clientManager` from (`clientManagerPath: "../../clients"` by default).
import {
  AuthenticationManager,
  ClientManager,
  createAuthHooks,
  reactorRetry,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: reactorRetry } },
})
export const clientManager = new ClientManager({ queryClient })

export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
