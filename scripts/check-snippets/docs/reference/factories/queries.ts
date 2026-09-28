// `src/queries/index.ts`, the module the overview page's "Centralized Query
// Definitions" shows and its router examples import as `../queries`.
import { createMutation, createQueryFactory } from "@ic-reactor/react"
import { backend } from "./reactor"

export const getUserQuery = createQueryFactory(backend, {
  functionName: "get_user",
  staleTime: 5 * 60 * 1000,
})

export const getPostsQuery = createQueryFactory(backend, {
  functionName: "get_posts",
})

export const createPostMutation = createMutation(backend, {
  functionName: "create_post",
  invalidateQueries: [getPostsQuery],
})

export const queryKeys = {
  users: () => getUserQuery.getQueryKey(),
  userById: (id: string) => getUserQuery([id]).getQueryKey(),
  posts: () => getPostsQuery.getQueryKey(),
}
