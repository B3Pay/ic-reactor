// `./declarations/backend` of the createActorHooks, createAuthHooks and
// reactorHooks pages: the canister their examples call. It is an ICRC-1 token
// ledger (`icrc1_balance_of`, `icrc1_transfer`, ...) that also hosts a small
// social app: users, posts and paginated lists.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import type { _SERVICE as LedgerService } from "../../../../app/declarations/ledger"

export interface User {
  id: string
  name: string
  email: string
}
export interface UserStats {
  posts: number
  followers: number
}

export interface Post {
  id: string
  title: string
  content: string
  likes: bigint
  isLiked: boolean
}
export interface NewPost {
  title: string
  content: string
}
export interface PostsPage {
  posts: Array<Post>
  nextOffset: [] | [number]
}
export interface FeedPage {
  posts: Array<Post>
  nextCursor: [] | [string]
}

export interface Item {
  id: string
  name: string
}
export interface ItemsPage {
  items: Array<Item>
  nextOffset: [] | [number]
}
export interface CursorPage {
  items: Array<Item>
  nextCursor: [] | [string]
}
export interface PagedItems {
  items: Array<Item>
  hasMore: boolean
}

export interface Product {
  id: string
  name: string
  price: bigint
}
export interface ProductsPage {
  products: Array<Product>
  hasMore: boolean
}

export interface TimelineItem {
  id: string
  text: string
}
export interface Timeline {
  items: Array<TimelineItem>
  oldestTimestamp: [] | [bigint]
  newestTimestamp: [] | [bigint]
}

export type BalanceError =
  { NotFound: null } | { AccountFrozen: { reason: string } }
export type BalanceResult = { Ok: bigint } | { Err: BalanceError }

export interface Notification {
  id: string
  text: string
}
export interface Config {
  theme: string
}
export interface Metadata {
  name: string
  version: string
}

export interface _SERVICE extends LedgerService {
  greet: ActorMethod<[string], string>
  get_user: ActorMethod<[string], User>
  get_user_stats: ActorMethod<[string], UserStats>
  get_user_posts: ActorMethod<[string], Array<Post>>
  create_user: ActorMethod<[{ name: string; email: string }], User>
  get_posts: ActorMethod<[], Array<Post>>
  get_posts_count: ActorMethod<[], bigint>
  get_post: ActorMethod<[string], Post>
  create_post: ActorMethod<[NewPost], Post>
  like_post: ActorMethod<[string], undefined>
  list_posts: ActorMethod<
    [{ authorId: string; offset: number; limit: number }],
    PostsPage
  >
  list_feed: ActorMethod<[{ cursor: [] | [string]; limit: number }], FeedPage>
  get_items: ActorMethod<[{ offset: number; limit: number }], ItemsPage>
  get_items_after: ActorMethod<[{ after: [] | [string] }], CursorPage>
  get_items_by_page: ActorMethod<
    [{ page: number; perPage: number }],
    PagedItems
  >
  get_products: ActorMethod<[{ page: number; perPage: number }], ProductsPage>
  get_timeline: ActorMethod<[{ around: bigint; limit: number }], Timeline>
  get_balance: ActorMethod<[Principal], BalanceResult>
  get_notifications: ActorMethod<[], Array<Notification>>
  get_config: ActorMethod<[], Config>
  get_metadata: ActorMethod<[], Metadata>
  get_price: ActorMethod<[], number>
  get_data: ActorMethod<[], string>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
