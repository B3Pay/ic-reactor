// `src/queries.ts` of the guides: query and mutation objects over the backend.
import {
  createMutation,
  createQuery,
  createQueryFactory,
} from "@ic-reactor/react"
import { backend } from "./reactor"

export const postsQuery = createQuery(backend, { functionName: "get_posts" })
export const getPost = createQueryFactory(backend, { functionName: "get_post" })

export const createPost = createMutation(backend, {
  functionName: "create_post",
  invalidateQueries: [postsQuery, { functionName: "get_posts_count" }],
})
export const likePost = createMutation(backend, { functionName: "like_post" })
