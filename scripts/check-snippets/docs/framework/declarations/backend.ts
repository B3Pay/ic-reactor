// `./declarations/backend` of the framework pages (React Setup, Queries,
// Mutations, Query Caching): the canister their examples call, as
// `dfx generate` (or `@icp-sdk/bindgen`) types it. It hosts a small social
// app (users, posts, paginated items) and a token `transfer`. The pages build
// a raw `Reactor` over it, so its values are Candid values: `bigint`,
// `Principal`, and `[] | [T]` for an `opt`.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"

export interface User {
  id: string
  name: string
  bio: string
}
export interface Profile {
  id: string
  name: string
}

export interface Post {
  id: string
  title: string
  content: string
  likes: bigint
}
export interface PostInput {
  title: string
  content: string
}
export type CreatePostError = { EmptyTitle: null } | { NotSignedIn: null }

export interface TransferReceipt {
  block_index: bigint
}
export type TransferError =
  { InsufficientFunds: { balance: bigint } } | { InvalidRecipient: null }

export type ClaimError = { NotFound: null } | { AlreadyClaimed: null }

export interface Item {
  id: string
  name: string
}
export interface ItemsPage {
  items: Array<Item>
  nextOffset: [] | [number]
}

export interface Config {
  maintenance: boolean
}
export interface Metadata {
  name: string
  symbol: string
}
export interface Notification {
  id: string
  text: string
}
export interface Settings {
  theme: string
  notifications: boolean
}
export interface Account {
  owner: [] | [Principal]
  subaccount: [] | [Uint8Array]
}

export interface _SERVICE {
  get_user: ActorMethod<[string], User>
  get_profile: ActorMethod<[string], Profile>
  get_my_profile: ActorMethod<[], Profile>
  get_claim: ActorMethod<[Uint8Array], { Ok: bigint } | { Err: ClaimError }>
  get_config: ActorMethod<[], Config>
  get_metadata: ActorMethod<[], Metadata>
  get_price: ActorMethod<[], bigint>
  get_notifications: ActorMethod<[], Array<Notification>>
  get_data: ActorMethod<[], string>
  get_settings: ActorMethod<[], Settings>
  get_items: ActorMethod<[{ offset: number; limit: number }], ItemsPage>
  get_btc_address: ActorMethod<[Account], string>
  get_posts: ActorMethod<[], Array<Post>>
  get_post_count: ActorMethod<[], bigint>
  get_post: ActorMethod<[string], Post>
  create_post: ActorMethod<[PostInput], { Ok: Post } | { Err: CreatePostError }>
  like_post: ActorMethod<[string], undefined>
  transfer: ActorMethod<
    [Principal, bigint],
    { Ok: TransferReceipt } | { Err: TransferError }
  >
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
