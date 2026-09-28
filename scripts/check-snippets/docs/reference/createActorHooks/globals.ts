// Names the createActorHooks pages' snippets use without importing them: what
// the default app declares, plus the components and values of the app the pages
// build. Never a library export: a snippet that uses one must import it.
/// <reference path="./modules.d.ts" />
import type { ReactNode } from "react"
import type { FunctionName, ReactorDataOf } from "@ic-reactor/react"
import type { backend } from "./reactor"
import type { _SERVICE } from "./declarations/backend"

export * from "../../../app/globals"

/** What a method of the pages' canister resolves with, as `backend` shows it. */
type Data<Method extends FunctionName<_SERVICE>> = ReactorDataOf<
  typeof backend,
  Method
>

// ── Values of the app ────────────────────────────────────────────────────────

/** The id of the user a page shows. */
export declare const userId: string

/** The recipient (a principal's text) and amount (base units) of a transfer. */
export declare const recipient: string
export declare const amount: string

/** A post the page is about to create. */
export declare const postData: { title: string; content: string }

/** Navigates the router to a path. */
export declare function navigate(to: string): void

// ── Components of the app ────────────────────────────────────────────────────

export declare function Loading(): ReactNode
export declare function LoadingSpinner(): ReactNode
export declare function LoadingSkeleton(): ReactNode
export declare function PageSkeleton(): ReactNode
export declare function ContentSkeleton(): ReactNode
export declare function SidebarSkeleton(): ReactNode
export declare function ListSkeleton(): ReactNode
export declare function ProductListSkeleton(): ReactNode

export declare function Header(): ReactNode
export declare function MainContent(): ReactNode
export declare function Sidebar(): ReactNode

export declare function Item(props: {
  data: Data<"get_items">["items"][number]
}): ReactNode
export declare function ItemCard(props: {
  item: Data<"get_items">["items"][number]
}): ReactNode
export declare function ItemList(): ReactNode
export declare function ProductCard(props: {
  product: Data<"get_products">["products"][number]
}): ReactNode
export declare function TimelineItems(props: {
  items: Data<"get_timeline">["items"]
}): ReactNode
export declare function NotificationList(props: {
  data: Data<"get_notifications"> | undefined
}): ReactNode
export declare function PostList(props: {
  posts: Data<"get_user_posts"> | undefined
  author?: string
}): ReactNode
export declare function Stats(props: {
  data: Data<"get_user_stats">
}): ReactNode
export declare function UserProfile(props: { userId: string }): ReactNode
