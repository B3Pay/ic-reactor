// Names a snippet of the default app may use without importing them: the
// objects an app builds once and the values a page has at hand. Never a
// library export: a snippet that uses one must import it. The consumer guides
// (`llms.txt`, the package guides, skill-packages/ic-reactor) get none of
// these: their snippets import every name they use.
//
// The 3.x fixtures (a `clientManager`, a `./reactor` of `defineReactor`, the
// canister's declarations in `idlFactory` form) went with the 3.x runtime.
// The generated modules a snippet imports as `./generated/<name>` are in
// `generated/`, as `candid-core-cli gen` wrote them for the `.did` files there.
import type { Principal } from "@icp-sdk/core/principal"

/** A toast helper such as sonner's. */
export declare const toast: {
  success(message: string): void
  error(message: string): void
}

/** A button of the page. */
export declare const button: HTMLButtonElement

/** A principal the app has, such as the signed-in user's. */
export declare const principal: Principal

/** Another canister of the same interface. */
export declare const otherCanisterId: string
