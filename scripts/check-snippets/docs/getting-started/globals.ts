// Names the getting-started pages' snippets use without importing them: what
// the default app declares, plus the values and components of the app the pages
// build. Never a library export: a snippet that uses one must import it.
import type { ReactNode } from "react"
import type { ActorSubclass } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { _SERVICE } from "./declarations/backend"

export * from "../../app/globals"

// The pages' own `src/clients.ts` (Local Development).
export { authentication, clientManager, queryClient } from "./clients"

// ── Values of the app ────────────────────────────────────────────────────────

/** The raw actor an app without IC Reactor creates for the canister. */
export declare const actor: ActorSubclass<_SERVICE>

/** The recipient and amount (base units) of a transfer. */
export declare const recipient: Principal
export declare const amount: bigint

// ── Components of the app ────────────────────────────────────────────────────

export declare function YourApp(): ReactNode
