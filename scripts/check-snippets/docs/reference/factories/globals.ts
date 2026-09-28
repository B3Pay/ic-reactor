// Names the factory pages' snippets use without importing them: what the
// default app declares, plus the components and values of the app the pages
// build. Never a library export: a snippet that uses one must import it.
/// <reference path="./modules.d.ts" />
import type { ReactNode } from "react"
import {
  createInfiniteQuery,
  createSuspenseInfiniteQuery,
  type FunctionName,
  type ReactorDataOf,
} from "@ic-reactor/react"
import { backend } from "./reactor"
import type { _SERVICE } from "./declarations/backend"

export * from "../../../app/globals"

/** What a method of the pages' canister resolves with, as `backend` shows it. */
type Data<Method extends FunctionName<_SERVICE>> = ReactorDataOf<
  typeof backend,
  Method
>

// ── Values of the app ────────────────────────────────────────────────────────

/** The signed-in user's id, and the id of the user a page shows. */
export declare const currentUserId: string
export declare const userId: string

/** A user the page has edited, and a post it is creating. */
export declare const updatedUser: Data<"get_user">
export declare const newPost: Data<"get_post">

/** An analytics client. */
export declare const analytics: { track(event: string): void }

/** The infinite queries the app defines once and its components share. */
export const postsQuery = createInfiniteQuery(backend, {
  functionName: "list_posts",
  initialPageParam: 0,
  getArgs: (offset) => [{ offset, limit: 20 }] as const,
  getNextPageParam: (lastPage) => lastPage.nextOffset,
})
export const productsQuery = createInfiniteQuery(backend, {
  functionName: "list_products",
  initialPageParam: 0,
  getArgs: (offset) => [{ offset, limit: 24 }] as const,
  getNextPageParam: (lastPage) => lastPage.nextOffset,
})
export const galleryQuery = createSuspenseInfiniteQuery(backend, {
  functionName: "list_images",
  initialPageParam: 0,
  getArgs: (offset) => [{ offset, limit: 24 }] as const,
  getNextPageParam: (lastPage) => lastPage.nextOffset,
})

/** The route tree TanStack Router's plugin generates. */
export declare const routeTree: unknown

// ── Components of the app ────────────────────────────────────────────────────

export declare function RootLayout(): ReactNode
export declare function PostsPage(): ReactNode
export declare function UserPage(): ReactNode
export declare function LoginPrompt(): ReactNode

export declare function UserSkeleton(): ReactNode
export declare function HeaderSkeleton(): ReactNode
export declare function StatsSkeleton(): ReactNode
export declare function ActivitySkeleton(): ReactNode
export declare function DashboardSkeleton(): ReactNode
export declare function FeedSkeleton(): ReactNode
export declare function CommentsSkeleton(): ReactNode
export declare function GallerySkeleton(): ReactNode
export declare function ProductGridSkeleton(): ReactNode

export declare function Spinner(): ReactNode
export declare function LoadingSpinner(): ReactNode
export declare function PostCard(props: { post: Data<"get_post"> }): ReactNode
export declare function ProductCard(props: {
  product: Data<"list_products">["products"][number]
}): ReactNode
export declare function Comment(props: {
  comment: Data<"get_comments">[number]
}): ReactNode
export declare function FeedPost(props: {
  post: Data<"get_feed">["posts"][number]
}): ReactNode
export declare function GalleryImage(props: {
  image: Data<"list_images">["images"][number]
}): ReactNode
export declare function ProductGrid(props: {
  products: Data<"list_products">["products"]
}): ReactNode
export declare function Message(props: {
  message: Data<"get_messages">["messages"][number]
}): ReactNode
export declare function ErrorMessage(props: { error: Error }): ReactNode

export declare function Avatar(props: { userId: string }): ReactNode
export declare function Header(props: {
  user: Data<"get_my_profile">
}): ReactNode
export declare function Stats(props: {
  data: Data<"get_dashboard_stats">
}): ReactNode
export declare function ActivityList(props: {
  items: Data<"get_recent_activity">
}): ReactNode
export declare function PostsList(props: {
  posts: Data<"get_user_posts">
}): ReactNode
export declare function FollowersList(props: {
  followers: Data<"get_user_followers">
}): ReactNode
export declare function Profile(props: {
  user: Data<"get_user"> | undefined
}): ReactNode
export declare function ProfileCard(props: {
  profile: Data<"get_profile"> | undefined
}): ReactNode
