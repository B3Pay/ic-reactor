import type { MethodMode } from "@meantjs/schema"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"

/**
 * How the studio calls a method, decided once from its mode, its results and
 * the registry:
 *
 * - `read`: a `query` or `composite_query` with results, cached through
 *   `useQuery(readQueryOptions(…))`. Only a `query` has a certified twin.
 * - `idempotent`: an update the registry names in `idempotentUpdates` (the
 *   ckBTC minter's `get_btc_address`), read through
 *   `{ update: "idempotent" }`. It still goes through consensus, so it needs
 *   a signed-in caller.
 * - `update`: a write, confirmed first, sent once through `useMutation`.
 * - `oneway`: a write with no reply and no outcome, confirmed first.
 * - `call`: a query without results. `queryOptions` refuses it (a read that
 *   resolves `undefined` caches nothing), so it is called, not cached.
 */
export type CallKind =
  | { readonly kind: "read"; readonly certifiable: boolean }
  | { readonly kind: "idempotent" }
  | { readonly kind: "update" }
  | { readonly kind: "oneway" }
  | { readonly kind: "call" }

export function callKindOf(
  iface: CanisterInterface,
  method: MethodInfo
): CallKind {
  switch (method.mode) {
    case "query":
    case "composite_query":
      return method.results.length === 0
        ? { kind: "call" }
        : { kind: "read", certifiable: method.mode === "query" }
    case "update":
      return method.results.length > 0 &&
        iface.registry?.idempotentUpdates?.includes(method.name) === true
        ? { kind: "idempotent" }
        : { kind: "update" }
    case "oneway":
      return { kind: "oneway" }
  }
}

/** Whether the client refuses this kind of call from an anonymous caller. */
export const needsSignIn = (kind: CallKind): boolean =>
  kind.kind === "idempotent" || kind.kind === "update" || kind.kind === "oneway"

/** What the run button of a method says. */
export function submitLabelOf(kind: CallKind, mode: MethodMode): string {
  switch (kind.kind) {
    case "read":
      return mode === "composite_query" ? "Run composite query" : "Run query"
    case "idempotent":
      return "Get (idempotent update)"
    case "update":
      return "Review update…"
    case "oneway":
      return "Review oneway call…"
    case "call":
      return "Call"
  }
}

/** Why a write button is disabled while nobody is signed in. */
export const SIGN_IN_REASON =
  "Sign in to send writes: the client refuses them anyway (unauthenticated)."
