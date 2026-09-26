// Names the ic-reactor-hooks skill's snippets share: a raw `backendReactor`
// over a canister of users and posts, a ledger reactor, and the query and
// mutation objects its later snippets use.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import {
  Reactor,
  createMutation,
  createQuery,
  createQueryFactory,
} from "@ic-reactor/react"
import {
  canisterId as ledgerCanisterId,
  idlFactory as ledgerIdl,
  type TransferArg,
  type _SERVICE as _LEDGER,
} from "../app/declarations/ledger"
import { clientManager } from "../app/reactor"

export * from "../app/globals"
export { ledgerCanisterId, ledgerIdl, type _LEDGER }

export interface User {
  id: string
  name: string
}
export interface Post {
  id: bigint
  title: string
  likes: bigint
}
export interface Backend {
  get_user: ActorMethod<[string], User>
  update_user: ActorMethod<[User], undefined>
  get_likes: ActorMethod<[], Array<Principal>>
  like: ActorMethod<[], undefined>
  get_post: ActorMethod<[bigint], Post>
  like_post: ActorMethod<[bigint], undefined>
}
export declare const backendIdl: IDL.InterfaceFactory

export const backendReactor = new Reactor<Backend>({
  clientManager,
  idlFactory: backendIdl,
  name: "backend",
  canisterId: "bkyz2-fmaaa-aaaaa-qaaaq-cai",
})

export const ledgerReactor = new Reactor<_LEDGER>({
  clientManager,
  idlFactory: ledgerIdl,
  name: "ledger",
  canisterId: ledgerCanisterId,
})
export declare const transferArg: TransferArg

/** An ICP index canister, `./declarations/index`. */
export interface _INDEX {
  status: ActorMethod<[], { num_blocks_synced: bigint }>
}
export declare const indexIdl: IDL.InterfaceFactory
export const indexCanisterId = "qhbym-qaaaa-aaaaa-aaafq-cai"

export const getLikes = createQuery(backendReactor, {
  functionName: "get_likes",
  refetchInterval: 3000,
})
export const likeHeart = createMutation(backendReactor, {
  functionName: "like",
})
export const getPost = createQueryFactory(backendReactor, {
  functionName: "get_post",
})
export const likePost = createMutation(backendReactor, {
  functionName: "like_post",
})
