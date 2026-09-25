// The canister most snippets call, `./declarations/backend`. It holds what the
// declarations of `dfx generate` (or of `@icp-sdk/bindgen`) export, plus what
// the entry `@ic-reactor/codegen` writes for it with `factories: true`: the
// reactor, the six bound hooks and a query or mutation object per method.
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import {
  DisplayReactor,
  createActorHooks,
  createMutation,
  createQuery,
  createQueryFactory,
} from "@ic-reactor/react"
import { clientManager } from "../clients"

export interface Profile {
  name: string
  likes: bigint
}
export type ProfileError = { NotFound: null } | { NameTaken: null }

export interface Post {
  id: string
  title: string
  likes: bigint
}
export interface PostPage {
  posts: Array<Post>
  next: [] | [bigint]
}

export interface _SERVICE {
  greet: ActorMethod<[string], string>
  get_message: ActorMethod<[], string>
  set_message: ActorMethod<[string], undefined>
  get_profile: ActorMethod<[string], Profile>
  get_my_profile: ActorMethod<[], Profile>
  update_profile: ActorMethod<
    [{ name: string }],
    { Ok: Profile } | { Err: ProfileError }
  >
  get_posts: ActorMethod<[], Array<Post>>
  get_posts_count: ActorMethod<[], bigint>
  get_post: ActorMethod<[string], Post>
  create_post: ActorMethod<[string], { Ok: Post } | { Err: string }>
  like_post: ActorMethod<[string], undefined>
  list_posts: ActorMethod<[{ offset: bigint; limit: bigint }], PostPage>
  register_begin: ActorMethod<[], Uint8Array>
}

export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
export const canisterId = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

// index.generated.ts
export type BackendService = _SERVICE
export const backendReactor = new DisplayReactor<BackendService>({
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

// index.factories.generated.ts
export const greetQuery = createQueryFactory(backendReactor, {
  functionName: "greet",
})
export const getMessageQuery = createQuery(backendReactor, {
  functionName: "get_message",
})
export const setMessageMutation = createMutation(backendReactor, {
  functionName: "set_message",
})
export const getPostsQuery = createQuery(backendReactor, {
  functionName: "get_posts",
})
export const getPostQuery = createQueryFactory(backendReactor, {
  functionName: "get_post",
})
export const createPostMutation = createMutation(backendReactor, {
  functionName: "create_post",
})
export const likePostMutation = createMutation(backendReactor, {
  functionName: "like_post",
})
