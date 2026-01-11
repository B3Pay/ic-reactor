import {
  ClientManager,
  DisplayReactor,
  createMutation,
  createQuery,
  createSuspenseQuery,
  createAuthHooks,
  createInfiniteQuery,
} from "@ic-reactor/react"
import { idlFactory } from "../declarations/backend"
import { QueryClient } from "@tanstack/react-query"
import type { _SERVICE } from "../declarations/backend/backend.did"

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

// The canister name "backend" is used to look up the canister ID from the ic_env cookie
// The cookie is set by the ICP CLI dev server or the asset canister in production
export const reactor = new DisplayReactor<_SERVICE>({
  clientManager,
  name: "backend",
  idlFactory,
})

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(clientManager)

export const likeHeart = createMutation(reactor, {
  functionName: "like",
})

export const unlikeHeart = createMutation(reactor, {
  functionName: "unlike",
})

export const getLikes = createQuery(reactor, {
  functionName: "get_likes",
  refetchInterval: 3000,
})

export const getLogs = createQuery(reactor, {
  functionName: "get_logs",
  refetchInterval: 1000,
})

export const getPosts = createInfiniteQuery(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getArgs: (offset) => [offset.toString(), "5"] as const,
  getNextPageParam: (lastPage, allPages) => {
    if (lastPage.length < 5) return null
    return BigInt(allPages.length) * 5n
  },
})

export const getPostsCount = createQuery(reactor, {
  functionName: "get_posts_count",
  refetchInterval: 5000,
})

export const getPostsCountSuspense = createSuspenseQuery(reactor, {
  functionName: "get_posts_count",
})

export const getLikesSuspense = createSuspenseQuery(reactor, {
  functionName: "get_likes",
})

export const batchCreatePosts = createMutation(reactor, {
  functionName: "batch_create_posts",
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["get_posts"] })
    queryClient.invalidateQueries({ queryKey: ["get_logs"] })
  },
})

export const createPost = createMutation(reactor, {
  functionName: "create_post",
})

export const toggleChaosMode = createMutation(reactor, {
  functionName: "toggle_chaos_mode",
})

export const getChaosStatus = createQuery(reactor, {
  functionName: "get_chaos_status",
  refetchInterval: 5000,
})

// This code is only for TypeScript
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import("@tanstack/react-query").QueryClient
  }
}

// This code is for all users
window.__TANSTACK_QUERY_CLIENT__ = queryClient
