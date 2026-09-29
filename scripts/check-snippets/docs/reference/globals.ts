// Names the reference pages' snippets use without importing them: what the
// default app declares, over the pages' canister (`declarations/backend.ts`),
// plus the values the pages build earlier. Never a library export: a snippet
// that uses one must import it.
import type { Identity } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { ReactorArgsOf } from "@ic-reactor/react"
import type { FetchInfiniteQueryOptions, QueryKey } from "@tanstack/query-core"
import type { ReactNode } from "react"
import type { PostPage } from "./declarations/backend"
import type { backend } from "./reactor"
// The generated route tree of the pages' TanStack Router examples, which types
// their routes
import "../routeTree.gen"

export * from "../../app/globals"
export { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"
export { authentication, backend, clientManager, queryClient } from "./reactor"
export { ledger, ledgerReactor } from "./ledger"

/** An identity the app got from somewhere, such as a login it ran itself. */
export declare const newIdentity: Identity

/** The TanStack options of an infinite query the app fetches by hand. */
export declare const options: FetchInfiniteQueryOptions<
  PostPage,
  Error,
  PostPage,
  QueryKey,
  bigint
>

/** A login provider other than Internet Identity, such as a wallet. */
export declare const externalAuthProvider: {
  getIdentity(): Promise<Identity>
}

/** The canister of a Sign-In With Ethereum provider. */
export declare const siweProviderCanisterId: string

/** The app's root component. */
export declare function YourApp(): ReactNode

/** The management canister, the target of a call routed by its effective canister. */
export declare const managementCanisterId: Principal

/** What a transfer form holds: the display arguments of `transfer`. */
export declare const formData: ReactorArgsOf<typeof backend, "transfer">[0]

/** A form library's form. */
export declare const form: {
  setError(field: string | number, message: string): void
}

/** Async lookups of a blocklist the app keeps. */
export declare function isBlocked(address: string): Promise<boolean>
export declare function checkBlocklist(address: string): Promise<boolean>

/** Components of the `createReactorProvider` page's app. */
export declare function TokenDetails(): ReactNode
export declare function Dashboard(): ReactNode
export declare function Spinner(): ReactNode
