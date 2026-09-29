// `src/reactor/index.ts` of the createAuthHooks overview: the page's
// `QueryClient`, `ClientManager` and `AuthenticationManager`.
import { AuthenticationManager, ClientManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({ queryClient })

export const authentication = new AuthenticationManager({ clientManager })
