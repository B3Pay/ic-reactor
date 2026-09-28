// The canister the factory pages call, `./declarations/backend`: a small social
// app with users, posts, comments, a chat, a shop and a wallet. It is the
// pages' own app, not the default one in `app/`, so a page can show a user with
// an avatar or a feed with a cursor. The declarations are the ones `dfx generate`
// writes for its `.did`.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface Profile {
  name: string
  bio: string
  avatarUrl: string
}
export interface User {
  name: string
  email: string
  avatarUrl: string
  profile: Profile
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

/** A page of `list_posts`: `nextOffset` is `[]` on the last page. */
export interface PostPage {
  posts: Array<Post>
  hasMore: boolean
  nextOffset: [] | [number]
}
export interface PostRequest {
  offset: number
  limit: number
  userId: [] | [string]
  filter: [] | [string]
  q: [] | [string]
}
export interface CursorRequest {
  cursor: [] | [string]
  limit: number
}
export interface PostCursorPage {
  posts: Array<Post>
  nextCursor: [] | [string]
}

export interface Comment {
  id: string
  postId: string
  text: string
}
export interface CommentRequest {
  postId: string
  cursor: [] | [string]
  limit: number
}
export interface CommentPage {
  comments: Array<Comment>
  nextCursor: [] | [string]
}
export interface Activity {
  id: string
  summary: string
}
export interface Stats {
  posts: number
  followers: number
}

export interface Message {
  id: string
  text: string
  timestamp: bigint
}
export interface MessageRequest {
  before: bigint
  limit: number
}
export interface MessagePage {
  messages: Array<Message>
  hasNewer: boolean
  hasOlder: boolean
  newestTimestamp: bigint
  oldestTimestamp: bigint
}

export interface Product {
  id: string
  name: string
  category: string
}
export interface ProductRequest {
  offset: number
  limit: number
}
export interface ProductPage {
  products: Array<Product>
  totalCount: number
  nextOffset: [] | [number]
}
export interface Image {
  id: string
  url: string
}
export interface ImagePage {
  images: Array<Image>
  nextOffset: [] | [number]
}

export type TransferError =
  { InsufficientFunds: { balance: bigint } } | { Unauthorized: null }
export type TransferResult = { Ok: bigint } | { Err: TransferError }

export interface _SERVICE {
  get_user: ActorMethod<[string], User>
  rename_user: ActorMethod<[string, string], undefined>
  get_profile: ActorMethod<[string], Profile>
  get_my_profile: ActorMethod<[], Profile>
  update_profile: ActorMethod<[{ name: string }], undefined>
  get_posts: ActorMethod<[], Array<Post>>
  get_posts_count: ActorMethod<[], bigint>
  get_post: ActorMethod<[string], Post>
  create_post: ActorMethod<[NewPost], Post>
  like_post: ActorMethod<[string], undefined>
  delete_post: ActorMethod<[string], undefined>
  list_posts: ActorMethod<[PostRequest], PostPage>
  search_posts: ActorMethod<[[] | [string], bigint, bigint], PostPage>
  list_posts_by_cursor: ActorMethod<[CursorRequest], PostCursorPage>
  get_feed: ActorMethod<[CursorRequest], PostCursorPage>
  get_user_posts: ActorMethod<[string], Array<Post>>
  get_user_followers: ActorMethod<[string], Array<Profile>>
  get_user_activity: ActorMethod<[], Array<Activity>>
  get_dashboard_stats: ActorMethod<[], Stats>
  get_recent_activity: ActorMethod<[], Array<Activity>>
  get_comments: ActorMethod<[string], Array<Comment>>
  list_comments: ActorMethod<[CommentRequest], CommentPage>
  create_comment: ActorMethod<[string, string], Comment>
  get_messages: ActorMethod<[MessageRequest], MessagePage>
  list_products: ActorMethod<[ProductRequest], ProductPage>
  list_products_by_category: ActorMethod<[string, ProductRequest], ProductPage>
  add_product: ActorMethod<[{ name: string; category: string }], undefined>
  list_images: ActorMethod<[ProductRequest], ImagePage>
  get_balance: ActorMethod<[], bigint>
  transfer: ActorMethod<[string, bigint], TransferResult>
  withdraw: ActorMethod<[bigint], bigint>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "bd3sg-teaaa-aaaaa-qaaba-cai"
