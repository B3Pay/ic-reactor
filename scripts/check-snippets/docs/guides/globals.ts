// Names the guides' snippets use without importing them: what the default app
// declares, over the guides' canister (`declarations/backend.ts`), plus the
// values and components of the app the guides build. Never a library export: a
// snippet that uses one must import it.
import type { CanisterError } from "@ic-reactor/react"
import type { ReactNode } from "react"

export * from "../../app/globals"
export { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

// ── Values of the app ────────────────────────────────────────────────────────

/** The id of the user a page shows. */
export declare const userId: string

/** The recipient (a principal's text) and amount (base units) of a transfer. */
export declare const recipient: string
export declare const amount: string

/** Navigates the router to a path. */
export declare function navigate(to: string): void

/** The app's own reaction to an `Err` the canister returned. */
export declare function handleCanisterError(error: CanisterError): void

// ── Components of the app ────────────────────────────────────────────────────

export declare function Loading(): ReactNode
export declare function LoadingSpinner(): ReactNode
export declare function LoadingScreen(props: { message: string }): ReactNode
export declare function ErrorScreen(props: { error: Error }): ReactNode
export declare function ErrorMessage(props: { error: Error }): ReactNode
export declare function UserNotFound(props: { userId: string }): ReactNode
export declare function Unauthorized(props: { message: string }): ReactNode
export declare function UserCard(props: {
  user: { name: string; email: string }
}): ReactNode
export declare function DataDisplay(props: {
  data: string | undefined
}): ReactNode
export declare function YourApp(): ReactNode
