import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export type ChaosResult = { ok: null } | { err: string }
export interface Log {
  action: string
  timestamp: bigint
  details: string
  caller: Principal
}
export interface Post {
  id: bigint
  content: string
  timestamp: bigint
  caller: Principal
}
export interface _SERVICE {
  batch_create_posts: ActorMethod<[Array<string>], Array<bigint>>
  create_post: ActorMethod<[string], bigint>
  get_likes: ActorMethod<[], Array<Principal>>
  get_logs: ActorMethod<[], Array<Log>>
  get_posts: ActorMethod<[bigint, bigint], Array<Post>>
  get_posts_count: ActorMethod<[], bigint>
  get_chaos_status: ActorMethod<[], boolean>
  like: ActorMethod<[], ChaosResult>
  toggle_chaos_mode: ActorMethod<[], boolean>
  unlike: ActorMethod<[], ChaosResult>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
