import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Post {
  id: bigint
  title: string
  content: string
  category: string
}
export interface PostsResponse {
  next_cursor: [] | [bigint]
  posts: Array<Post>
}
export interface _SERVICE {
  get_posts: ActorMethod<[[] | [string], bigint, bigint], PostsResponse>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
