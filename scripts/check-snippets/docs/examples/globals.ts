// Names the examples pages' snippets use without importing them: what the
// default app declares (`../../app/globals`), plus the components and values of
// the demo apps the pages describe. Never a library export: a snippet that
// uses one must import it.
import type { FieldNode } from "@ic-reactor/candid"
import type { Reactor } from "@ic-reactor/react"
import type { Principal } from "@icp-sdk/core/principal"
import type { AnyFormApi } from "@tanstack/react-form"
import type { ReactNode } from "react"
import type { Post } from "./declarations/backend"
import type { _SERVICE as LedgerService } from "./declarations/ledger"
// The tanstack-router demo's generated route tree, which types its routes
import "../routeTree.gen"

export * from "../../app/globals"

// ── Values of the demo apps ──────────────────────────────────────────────────

/**
 * The ledger reactor of the typescript demo's `src/main.ts`, a raw `Reactor`
 * that a later snippet of that page uses without repeating its setup. It is the
 * one page that does: a snippet of another page that names `ledgerReactor`
 * imports it (the tanstack-router page's `../reactor` is a `DisplayReactor`).
 */
export declare const ledgerReactor: Reactor<LedgerService>

/** The principal a transfer is sent to. */
export declare const recipientPrincipal: Principal

// ── Components of the demo apps ──────────────────────────────────────────────

/** A post of the infinite-query demo's feed. */
export declare function PostCard(props: { post: Post }): ReactNode

/** The tanstack-form demo's field renderer. */
export declare function DynamicField(props: {
  field: FieldNode
  form: AnyFormApi
  parentName?: string
}): ReactNode
