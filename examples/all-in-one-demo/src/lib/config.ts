import {
  createMutation,
  createQuery,
  createSuspenseQuery,
  createAuthHooks,
  createInfiniteQuery,
} from "@ic-reactor/react"

import { clientManager, queryClient } from "./client"
export { clientManager, queryClient }
import { backendReactor } from "../canisters/backend"

export const reactor = backendReactor

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
