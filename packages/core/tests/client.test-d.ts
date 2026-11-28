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
  isReactorError,
  type AuthLike,
  type AuthState,
  type CallEvent,
  type Client,
  type ClientOptions,
  type ReactorError,
} from "../src/index.js"
import { internalsOf } from "../src/client.js"
import type { CanisterIdResolution } from "../src/network.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import * as icrc1 from "./fixtures/icrc1.js"

const identity = Ed25519KeyIdentity.generate()

// Who calls is said exactly once: the two ways to get it wrong are traps, in
// traps.test-d.ts.
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

// Both @icp-sdk/auth 11's AuthClient and the test auth are an AuthLike as
// they are, with no adapter.
declare const authClient: AuthClient
export const fromAuthClient: AuthLike = authClient
export const fromTestAuth: AuthLike = createTestAuth({ seed: 1 })
createClient({ network: "ic", auth: () => new AuthClient() })
createClient({ network: "ic", auth: () => createTestAuth() })

// The factory is handed the client's network under AuthClient 11's own option
// names, so it passes straight through, or spread with a provider of its own.
// Its agentOptions, fetch included, fit AuthClient 11's
// Omit<HttpAgentOptions, "identity">.
createClient({ network: "env", auth: (network) => new AuthClient(network) })
createClient({
  network: "env",
  fetch: globalThis.fetch,
  auth: (network) => new AuthClient(network),
})
createClient({
  network: "env",
  auth: (network) =>
    new AuthClient({
      ...network,
      identityProvider: {
        authorizeUrl: "http://id.ai.localhost:8000/authorize",
        canisterId: "bkyz2-fmaaa-aaaaa-qaaaq-cai",
      },
      openIdProvider: "google",
    }),
})
createClient({
  network: "local",
  auth: (network) => {
    expectTypeOf(network.agentOptions.host).toEqualTypeOf<string>()
    expectTypeOf(network.agentOptions.rootKey).toEqualTypeOf<
      Uint8Array | undefined
    >()
    expectTypeOf(
      network.agentOptions.shouldFetchRootKey
    ).toEqualTypeOf<boolean>()
    // The client's own fetch, when it was given one, for AuthClient's agents.
    expectTypeOf(network.agentOptions.fetch).toEqualTypeOf<
      typeof globalThis.fetch | undefined
    >()
    expectTypeOf(network.identityProvider).toEqualTypeOf<
      { readonly authorizeUrl: string; readonly canisterId: string } | undefined
    >()
    // @ts-expect-error what the client hands over is read, never written
    network.agentOptions = { host: "x", shouldFetchRootKey: false }
    return createTestAuth()
  },
})
// The factory is handed one argument, never two.
const twoArguments = (_network: unknown, _more: string) => createTestAuth()
// @ts-expect-error a factory that needs a second argument is never given one
createClient({ network: "ic", auth: twoArguments })
expectTypeOf<AuthClient>().toExtend<AuthLike>()

// A state a later @icp-sdk/auth adds is still an AuthLike's: it reads as
// anonymous, and the app keeps compiling.
export const unknownStatus: AuthLike = {
  ...createTestAuth(),
  getStatus: () => ({ state: "revoked" as const }),
}
// The four known states still complete in an editor and narrow in a switch.
expectTypeOf<"signed-out">().toExtend<
  ReturnType<AuthLike["getStatus"]>["state"]
>()
export const numericStatus: AuthLike = {
  ...createTestAuth(),
  // @ts-expect-error a state is a string, never a number
  getStatus: () => ({ state: 1 }),
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
  readonly nobody?: true
}>()

// The option type is usable on its own.
export const options: ClientOptions = { network: "env", identity: "anonymous" }

// client.canisterId takes a canister's target and answers with the id, or a
// reason that narrows on `ok`.
{
  const client = createClient({ network: "local", identity: "anonymous" })
  const answer = client.canisterId({ name: "backend", certified: true })
  if (answer.ok) {
    expectTypeOf(answer.id).toEqualTypeOf<string>()
  } else {
    expectTypeOf(answer.reason).toEqualTypeOf<
      "no_browser" | "untrusted_host" | "absent"
    >()
    expectTypeOf(answer.message).toEqualTypeOf<string>()
  }
  // The same answer the resolver of the calls gives, so the reasons cannot
  // drift apart.
  expectTypeOf(answer).toEqualTypeOf<CanisterIdResolution>()
  // @ts-expect-error a target is { id } or { name }, never both
  client.canisterId({ id: "aaaaa-aa", name: "backend" })
}

// client.onCall takes a listener of the events of every call, and returns the
// function that removes it. An event narrows on `phase`.
{
  const client = createClient({ network: "ic", identity: "anonymous" })
  const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
    id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  })
  const stop = client.onCall((event) => {
    expectTypeOf(event).toEqualTypeOf<CallEvent>()
    expectTypeOf(event.id).toEqualTypeOf<number>()
    expectTypeOf(event.phase).toEqualTypeOf<
      "start" | "success" | "error" | "cancelled"
    >()
    if (event.phase === "start") {
      expectTypeOf(event.via).toEqualTypeOf<
        "query" | "mutation" | "direct" | "func"
      >()
      expectTypeOf(event.canisterId).toEqualTypeOf<string>()
      expectTypeOf(event.method).toEqualTypeOf<string>()
      expectTypeOf(event.mode).toEqualTypeOf<
        "query" | "composite_query" | "update" | "oneway"
      >()
      expectTypeOf(event.certified).toEqualTypeOf<boolean>()
      expectTypeOf(event.caller).toEqualTypeOf<string>()
      expectTypeOf(event.args).toEqualTypeOf<readonly unknown[]>()
      expectTypeOf(event.resendOf).toEqualTypeOf<boolean>()
      expectTypeOf(event.at).toEqualTypeOf<number>()
      // @ts-expect-error a start says nothing of how the call ends
      void event.sends
      return
    }
    // The three ends say how many requests went out and how long it took,
    // and repeat nothing of the start.
    expectTypeOf(event.sends).toEqualTypeOf<number>()
    expectTypeOf(event.ms).toEqualTypeOf<number>()
    // @ts-expect-error an end does not name the method: its start did
    void event.method
    if (event.phase === "success") {
      expectTypeOf(event.data).toEqualTypeOf<unknown>()
      // @ts-expect-error a success has no error
      void event.error
      return
    }
    expectTypeOf(event.phase).toEqualTypeOf<"error" | "cancelled">()
    expectTypeOf(event.error).toEqualTypeOf<ReactorError<unknown>>()
    // @ts-expect-error a call that rejected has no data
    void event.data
    // The guard's three-argument form types the canister's Err, as it does
    // where the call is awaited.
    const { error } = event
    if (
      isReactorError(error, ledger, "icrc1_transfer") &&
      error.kind === "canister_err"
    ) {
      expectTypeOf(error.err).toEqualTypeOf<icrc1.TransferError>()
    }
    // @ts-expect-error an event is read, never written
    event.id = 2
  })
  expectTypeOf(stop).toEqualTypeOf<() => void>()
  // A view (what useClient() returns) has the same member.
  expectTypeOf<Client["onCall"]>().toEqualTypeOf<
    (listener: (event: CallEvent) => void) => () => void
  >()
  // A listener takes the one event, and need not read it.
  client.onCall(() => {})
  // @ts-expect-error a listener is a function
  client.onCall("log")
  // @ts-expect-error onCall takes a listener
  client.onCall()
  // @ts-expect-error a listener is handed an event, not a second argument
  client.onCall((_event: CallEvent, _more: string) => {})
}
