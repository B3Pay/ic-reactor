// `./declarations/backend` of the two examples pages that call a canister named
// `backend` of their own: the all-in-one demo's likes canister (`get_likes`,
// `like`, `unlike`) and the infinite-query demo's `get_posts`. One module holds
// both canisters' methods because a snippet's import path names one module for
// the whole section, and one raw `Reactor` serves both: the all-in-one demo's
// `DisplayReactor` shows the principals `get_likes` returns as text, so this
// service types them as text (`vec text`) to give the raw reactor the same
// values.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import { Reactor, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "../../../app/clients"

export interface Post {
  id: bigint
  title: string
  content: string
  likes: bigint
  category: string
}
export interface PostsResponse {
  next_cursor: [] | [bigint]
  posts: Array<Post>
}
export type ChaosResult = { ok: null } | { err: string }

export interface _SERVICE {
  get_likes: ActorMethod<[], Array<string>>
  like: ActorMethod<[], ChaosResult>
  unlike: ActorMethod<[], ChaosResult>
  get_posts: ActorMethod<[[] | [string], bigint, bigint], PostsResponse>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "uxrrr-q7777-77774-qaaaq-cai"

// index.generated.ts
export type BackendService = _SERVICE
export const backendReactor = new Reactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})
export const {
  useActorQuery: useBackendQuery,
  useActorSuspenseQuery: useBackendSuspenseQuery,
  useActorInfiniteQuery: useBackendInfiniteQuery,
  useActorSuspenseInfiniteQuery: useBackendSuspenseInfiniteQuery,
  useActorMutation: useBackendMutation,
  useActorMethod: useBackendMethod,
} = createActorHooks(backendReactor)
