import {
  defineReactor,
  createSuspenseInfiniteQueryFactory,
} from "@ic-reactor/react"
import { canisterId, idlFactory } from "../src/declarations/backend"
import { _SERVICE } from "./declarations/backend/backend.did"

// 1. Bootstrap reactor (creates ClientManager + Reactor internally)
export const { reactor, clientManager } = defineReactor<_SERVICE>({
  name: "backend",
  canisterId,
  idlFactory,
})

// 2. Initialize the agent
clientManager.initialize()

// 3. Create the Suspense Infinite Query Factory
export const getPostsQuery = createSuspenseInfiniteQueryFactory(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,

  getNextPageParam: (lastPage) => {
    if (lastPage.next_cursor.length === 0) return undefined
    return lastPage.next_cursor[0]
  },

  gcTime: 1000 * 60 * 5,
  staleTime: 1000 * 60 * 1,
})
