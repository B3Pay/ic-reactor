// Names a snippet of the default app may use without importing them: the
// canister's declarations and the objects an app builds once. Never a library
// export: a snippet that uses one must import it.
import type { Principal } from "@icp-sdk/core/principal"

export { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"
export { authentication, clientManager, queryClient } from "./reactor"

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
