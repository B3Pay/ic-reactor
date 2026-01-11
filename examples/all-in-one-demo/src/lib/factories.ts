import {
  createMutation,
  createQuery,
  createSuspenseQuery,
  createInfiniteQuery,
} from "@ic-reactor/react"

import { queryClient } from "./client"
import { backendReactor } from "../canisters/backend"

export const likeHeart = createMutation(backendReactor, {
  functionName: "like",
})

export const unlikeHeart = createMutation(backendReactor, {
  functionName: "unlike",
})

export const getLikes = createQuery(backendReactor, {
  functionName: "get_likes",
  refetchInterval: 3000,
})

export const getLogs = createQuery(backendReactor, {
  functionName: "get_logs",
  refetchInterval: 1000,
})

export const getPosts = createInfiniteQuery(backendReactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getArgs: (offset) => [offset.toString(), "5"] as const,
  getNextPageParam: (lastPage, allPages) => {
    if (lastPage.length < 5) return null
    return BigInt(allPages.length) * 5n
  },
})

export const getPostsCount = createQuery(backendReactor, {
  functionName: "get_posts_count",
  refetchInterval: 5000,
})

export const getPostsCountSuspense = createSuspenseQuery(backendReactor, {
  functionName: "get_posts_count",
})

export const getLikesSuspense = createSuspenseQuery(backendReactor, {
  functionName: "get_likes",
})

export const batchCreatePosts = createMutation(backendReactor, {
  functionName: "batch_create_posts",
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["get_posts"] })
    queryClient.invalidateQueries({ queryKey: ["get_logs"] })
  },
})

export const createPost = createMutation(backendReactor, {
  functionName: "create_post",
})

export const toggleChaosMode = createMutation(backendReactor, {
  functionName: "toggle_chaos_mode",
})

export const getChaosStatus = createQuery(backendReactor, {
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
