import { createSuspenseInfiniteQueryFactory } from "@ic-reactor/react"
import { backendReactor } from "./declarations/backend"

// Create the Suspense Infinite Query Factory
export const getPostsQuery = createSuspenseInfiniteQueryFactory(
  backendReactor,
  {
    functionName: "get_posts",
    initialPageParam: 0n,

    getNextPageParam: (lastPage) => {
      if (lastPage.next_cursor.length === 0) return undefined
      return lastPage.next_cursor[0]
    },

    gcTime: 1000 * 60 * 5,
    staleTime: 1000 * 60 * 1,
  }
)
