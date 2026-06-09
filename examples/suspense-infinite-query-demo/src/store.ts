import { AuthenticationManager } from "@ic-reactor/auth"
import {
  defineReactor,
  createSuspenseInfiniteQueryFactory,
} from "@ic-reactor/react"
import { createAuthHooks } from "@ic-reactor/auth-react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory } from "../src/declarations/backend"
import { _SERVICE } from "./declarations/backend/backend.did"

// 1. Setup QueryClient
export const queryClient = new QueryClient()

// This code is only for TypeScript
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import("@tanstack/query-core").QueryClient
  }
}

// This code is for all users
window.__TANSTACK_QUERY_CLIENT__ = queryClient

// 2. One-call setup: defineReactor wires the ClientManager + Reactor + hooks
export const { reactor, clientManager } = defineReactor<_SERVICE>({
  name: "backend",
  canisterId,
  idlFactory,
  withProcessEnv: true,
  queryClient,
})

// 3. Auth (uses the ClientManager created by defineReactor)
export const authentication = new AuthenticationManager({ clientManager })

// 4. Create auth hooks (useAuth auto-initializes the agent and fetches root key)
export const { useAuth, useAgentState } = createAuthHooks(authentication)

// 5. Create the Suspense Infinite Query Factory
// This allows us to create specific queries for each category dynamically
export const getPostsQuery = createSuspenseInfiniteQueryFactory(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n, // Start with bigint 0

  // Determine next page param
  getNextPageParam: (lastPage) => {
    if (lastPage.next_cursor.length === 0) return undefined
    return lastPage.next_cursor[0]
  },

  // Optional: settings
  gcTime: 1000 * 60 * 5,
  staleTime: 1000 * 60 * 1,
})
