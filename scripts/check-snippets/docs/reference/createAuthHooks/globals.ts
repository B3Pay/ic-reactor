// Names the createAuthHooks pages' snippets use without importing them: what
// the default app declares, plus the screens and components of the app the
// pages build. Never a library export: a snippet that uses one must import it.
import type { ReactNode } from "react"

export * from "../../../app/globals"

export declare function Loading(): ReactNode
export declare function LoadingScreen(): ReactNode
export declare function ErrorScreen(props: { error: Error }): ReactNode
export declare function Router(): ReactNode
