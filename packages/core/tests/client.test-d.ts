/**
 * Type tests for `createClient`. `pnpm typecheck` compiles this file, so each
 * `@ts-expect-error` below is an assertion that the line after it does not
 * compile. Nothing here runs.
 */
import { AuthClient } from "@icp-sdk/auth/client"
import { AnonymousIdentity, type HttpAgent } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import type { QueryClient } from "@tanstack/query-core"
import { expectTypeOf } from "vitest"
import * as entry from "../src/index.js"
import {
  createClient,
  type AuthLike,
  type AuthState,
  type Client,
  type ClientOptions,
} from "../src/index.js"
import { internalsOf } from "../src/client.js"
import { createTestAuth } from "../src/testing/index.js"

const identity = Ed25519KeyIdentity.generate()

// Who calls is said exactly once.
// @ts-expect-error neither identity nor auth: who calls is not written down
createClient({ network: "ic" })
// @ts-expect-error identity and auth together: who calls is written twice
createClient({ network: "ic", identity, auth: () => createTestAuth() })
createClient({ network: "ic", identity })
createClient({ network: "ic", identity: "anonymous" })
createClient({ network: "ic", identity: new AnonymousIdentity() })
// @ts-expect-error "anonymous" is the one word an identity can be
createClient({ network: "ic", identity: "anon" })
// @ts-expect-error auth is a factory, not the auth itself
createClient({ network: "ic", auth: createTestAuth() })
// @ts-expect-error a network is required
createClient({ identity: "anonymous" })

// The other options.
createClient({
  network: { host: "http://127.0.0.1:4943", name: "dev" },
  identity: "anonymous",
  allowEnvConfig: false,
  fetch: globalThis.fetch,
  maxDepth: 1_024,
})
// @ts-expect-error maxDepth is a number
createClient({ network: "ic", identity: "anonymous", maxDepth: "1024" })

// Both @icp-sdk/auth 10's AuthClient and the test auth are an AuthLike as
// they are, with no adapter.
declare const authClient: AuthClient
export const fromAuthClient: AuthLike = authClient
export const fromTestAuth: AuthLike = createTestAuth({ seed: 1 })
createClient({ network: "ic", auth: () => new AuthClient() })
createClient({ network: "ic", auth: () => createTestAuth() })
expectTypeOf<AuthClient>().toExtend<AuthLike>()

// A status the client does not know is not an AuthLike's.
export const unknownStatus: AuthLike = {
  ...createTestAuth(),
  // @ts-expect-error "restoring" is not one of the four states
  getStatus: () => ({ state: "restoring" as const }),
}

// What a client offers.
const client: Client = createClient({ network: "ic", identity: "anonymous" })
expectTypeOf(client.network).toEqualTypeOf<string>()
expectTypeOf(client.queryClient).toEqualTypeOf<QueryClient>()
expectTypeOf(client.caller()).toEqualTypeOf<string>()
expectTypeOf(client.authState()).toEqualTypeOf<AuthState>()
expectTypeOf(client.signIn).returns.toEqualTypeOf<Promise<void>>()
expectTypeOf(client.signOut).returns.toEqualTypeOf<Promise<void>>()
expectTypeOf<AuthState["status"]>().toEqualTypeOf<
  "anonymous" | "signed-in" | "expired" | "signed-in-elsewhere"
>()
// @ts-expect-error the client's state is read, never written
client.authState().status = "signed-in"
// @ts-expect-error the network is fixed at creation
client.network = "local"

// The internals the canister builders use are neither on the client nor in
// the package entry.
// @ts-expect-error agentFor is internal
void client.agentFor
// @ts-expect-error current is internal
void client.current
// @ts-expect-error internalsOf is not exported from the package entry
void entry.internalsOf
// The stamps ReactorProvider reads (the serial, the disposal flag) are no
// part of the type: no symbol key, and indexing by one does not compile.
expectTypeOf<Extract<keyof Client, symbol>>().toBeNever()
// @ts-expect-error the serial is internal
void client[Symbol.for("ic-reactor.client.serial")]
expectTypeOf(internalsOf(client).agentFor).parameter(0).toEqualTypeOf<string>()
expectTypeOf(internalsOf(client).agentFor).returns.toEqualTypeOf<
  Promise<HttpAgent>
>()
expectTypeOf(internalsOf(client).current()).toEqualTypeOf<{
  readonly principal: string
  readonly authenticated: boolean
}>()

// The option type is usable on its own.
export const options: ClientOptions = { network: "env", identity: "anonymous" }
