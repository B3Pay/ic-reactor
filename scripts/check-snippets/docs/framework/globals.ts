// Names the framework pages' snippets use without importing them: what the
// default app declares, plus the values and components of the app the pages
// build. Never a library export: a snippet that uses one must import it.
/// <reference path="./modules.d.ts" />
import type { ReactNode } from "react"
import type { AuthenticationManager } from "@ic-reactor/react"
import type { Principal } from "@icp-sdk/core/principal"
import type { Profile as ProfileData } from "./declarations/backend"

export * from "../../app/globals"

// ── Values of the app ────────────────────────────────────────────────────────

/** The id of the user, the profile and the post a page shows. */
export declare const userId: string
export declare const profileId: string
export declare const postId: string

/** The recipient and amount (base units) of a transfer. */
export declare const recipient: Principal
export declare const amount: bigint

/** Navigates the router to a path. */
export declare function navigate(to: string): void

/** An app's own provider factory: builds the managers of one request. */
export declare function createReactorContext(): {
  authentication: AuthenticationManager
}

// ── Components of the app ────────────────────────────────────────────────────

export declare function Loading(): ReactNode
export declare function LoadingSpinner(): ReactNode
export declare function LoadingScreen(): ReactNode
export declare function ErrorScreen(props: { error: Error }): ReactNode
export declare function YourApp(): ReactNode
export declare function Dashboard(): ReactNode
export declare function Profile(props: { data: ProfileData }): ReactNode
