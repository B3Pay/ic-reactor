// `../queries` of the mutation page's invalidation example: the module of the
// app that builds the query factories its mutations invalidate.
import { createQueryFactory } from "@ic-reactor/react"
import { backend } from "./reactor"

export const getPost = createQueryFactory(backend, { functionName: "get_post" })
