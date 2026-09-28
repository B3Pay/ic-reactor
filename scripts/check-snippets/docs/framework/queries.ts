// `src/queries.ts` of the framework pages: the query objects an app defines
// once, at module scope, and shares between components and mutations.
import { createQuery, createQueryFactory } from "@ic-reactor/react"
import { backend } from "./reactor/index"

export const postsQuery = createQuery(backend, { functionName: "get_posts" })

export const getPost = createQueryFactory(backend, { functionName: "get_post" })
