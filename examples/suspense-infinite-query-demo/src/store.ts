import { ClientManager, Reactor } from "@ic-reactor/core"
import {
  createSuspenseInfiniteQueryFactory,
  createAuthHooks,
} from "@ic-reactor/react"
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

// 2. Setup ClientManager (connects to IC or local replica)
export const clientManager = new ClientManager({
  withLocalEnv: true,
  port: 4943,
  queryClient,
})

// 3. Setup Reactor (interacts with specific canister)
export const reactor = new Reactor<_SERVICE>({
  clientManager,
  canisterId,
  idlFactory,
})

// 4. Create auth hooks (useAuth auto-initializes the agent and fetches root key)
export const { useAuth, useAgentState } = createAuthHooks(clientManager)

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
