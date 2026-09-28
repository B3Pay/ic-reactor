// `./factories` of the all-in-one demo: the `src/lib/factories.ts` its first
// example shows.
import { createMutation, createQuery } from "@ic-reactor/react"
import { backendReactor } from "./declarations/backend"

export const getLikes = createQuery(backendReactor, {
  functionName: "get_likes",
  refetchInterval: 3000,
})

export const likeHeart = createMutation(backendReactor, {
  functionName: "like",
})
