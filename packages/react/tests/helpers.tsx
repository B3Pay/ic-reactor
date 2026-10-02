/**
 * Fixtures for the binding tests: clients that never reach a network, a way
 * to count the disposals of the clients a provider is given, and clients of a
 * fake replica with one call to send through them.
 */
import { createClient, type AuthLike, type Client } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import { c } from "@candid-core/schema"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { vi, type Mock } from "vitest"

/** The controllable sign-in of a test client: `signIn`, `switchTo`, `expire` and the rest. */
export type TestAuth = ReturnType<typeof createTestClient>["auth"]

/**
 * A sign-in a test controls, for the tests that build a client around it
 * themselves (to count how often the client builds its auth, or to wrap it).
 * It is the `auth` of a test client, the only place the testing entry hands
 * one out; the fake replica next to it is never called, since no test here
 * calls a canister. `identity` is a seed.
 *
 * The test client is disposed at once. A client builds its auth on first use
 * and this one is never used, so it never took the auth over and disposing it
 * leaves the auth alone: whichever client the test hands the auth to owns it
 * from then on, as every client owns the auth it builds.
 */
export const testAuth = (
  options?: Parameters<typeof createTestClient>[0]
): TestAuth => {
  const { client, auth } = createTestClient(options)
  client.dispose()
  return auth
}

/** A client on the IC whose caller is whatever `auth` says. Sends nothing. */
export const clientWithAuth = (auth: () => AuthLike): Client =>
  createClient({ network: "ic", auth })

/** A client that is anonymous for good, as a server's is. */
export const anonymousClient = (): Client =>
  createClient({ network: "ic", identity: "anonymous" })

/** A client the test can ask whether it was disposed, and how often. */
export interface TrackedClient {
  readonly client: Client
  readonly dispose: Mock<() => void>
}

/**
 * `real` with a counting `dispose` in front of its own. The real client is
 * frozen, so this is an object over it, its prototype: every other member,
 * and the stamps core puts on a client (its creation serial among them), are
 * read from the real one.
 */
export function withDisposeSpy(real: Client): TrackedClient {
  const dispose = vi.fn(() => real.dispose())
  const client = Object.create(real, {
    dispose: { value: dispose, enumerable: true },
  }) as Client
  return { client, dispose }
}

/**
 * A client factory that records every client it builds, and counts the calls
 * of their `dispose()` (see {@link withDisposeSpy}).
 */
export function trackedFactory(build: () => Client) {
  const made: TrackedClient[] = []
  const factory = vi.fn((): Client => {
    const tracked = withDisposeSpy(build())
    made.push(tracked)
    return tracked.client
  })
  /** The record of a client the provider handed to a component. */
  const trackOf = (client: Client): TrackedClient => {
    const found = made.find((entry) => entry.client === client)
    if (found === undefined) {
      throw new Error("the client was not built by this factory")
    }
    return found
  }
  /** How many times `dispose()` was called on any client this factory built. */
  const disposals = (): number =>
    made.reduce((sum, entry) => sum + entry.dispose.mock.calls.length, 0)
  return { factory, made, trackOf, disposals }
}

/** Lets timers that are due, such as a provider's scheduled disposal, run. */
export const macrotask = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5))

/** One `register()` call that no `unregister()` has removed. */
export interface Registration {
  readonly target: object
  readonly held: Client
  readonly token: object
}

/**
 * A `FinalizationRegistry` whose collections the test decides. A real one runs
 * its cleanup at some garbage collection after a target became unreachable,
 * which no test can wait for. This one records every call and runs the cleanup
 * of every registration still standing when {@link collectAll} is called.
 *
 * Install it with {@link bindingsWith}: the provider makes its registry when
 * its module is evaluated.
 */
export function fakeFinalizationRegistry() {
  /** Registrations still standing. */
  const live: Registration[] = []
  /** The held value of every `register()` call, in order. */
  const registered: Client[] = []
  /** The token of every `unregister()` call, in order. */
  const unregistered: object[] = []
  const cleanups: Array<(held: Client) => void> = []

  class Registry {
    constructor(cleanup: (held: Client) => void) {
      cleanups.push(cleanup)
    }
    register(target: object, held: Client, token: object): void {
      live.push({ target, held, token })
      registered.push(held)
    }
    unregister(token: object): boolean {
      unregistered.push(token)
      const before = live.length
      live.splice(
        0,
        live.length,
        ...live.filter((registration) => registration.token !== token)
      )
      return live.length < before
    }
  }

  /**
   * Runs the cleanup of every registration still standing, once, as a
   * collection does once their targets are unreachable. A committed
   * provider's state stays reachable, so a real collection would not reach
   * it; a registration left standing for it is still the defect a test looks
   * for, because the provider's unmount, not the registry, owns that client.
   */
  const collectAll = (): void => {
    for (const { held } of live.splice(0)) {
      for (const cleanup of cleanups) cleanup(held)
    }
  }

  return { Registry, live, registered, unregistered, cleanups, collectAll }
}

/**
 * A fresh copy of the bindings, evaluated with `registry` as the global
 * `FinalizationRegistry`, or with none when it is `undefined`. Undo it with
 * `vi.unstubAllGlobals()`.
 */
export async function bindingsWith(
  registry: unknown
): Promise<typeof import("../src/index.js")> {
  vi.stubGlobal("FinalizationRegistry", registry)
  vi.resetModules()
  return import("../src/index.js")
}

/** The canister {@link callThrough} calls. */
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** Candid's empty argument and reply, `()`. */
const EMPTY = new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0, 0])

/** The service of that canister: one query that takes and returns nothing. */
const PING = c.service({ ping: c.func([], [], "query") })

/**
 * A test client over a fake replica whose canister records who called it, and
 * the sign-in the client calls as. `identity` is a seed, as for
 * {@link testAuth}. The client is created when this is called, so a provider
 * whose factory returns it borrows it, as one at module scope is.
 */
export function clientWithCanister(
  options?: Parameters<typeof createTestClient>[0]
): {
  readonly client: Client
  readonly auth: TestAuth
  /** The callers the canister saw, as principal text, in order. */
  readonly callers: string[]
} {
  const callers: string[] = []
  const test = createTestClient(options)
  test.mock<{ ping: () => Promise<void> }>(PING, CANISTER, {
    ping: ({ caller }) => {
      callers.push(caller)
    },
  })
  return { client: test.client, auth: test.auth, callers }
}

/** What {@link callThrough} uses of core's internal `internalsOf`. */
interface CallPath {
  agentFor(
    principal: string,
    context: { readonly method: string; readonly canisterId: string }
  ): Promise<{
    query(
      canisterId: string,
      options: { methodName: string; arg: Uint8Array }
    ): Promise<{ status: unknown }>
  }>
}

/**
 * Core's `internalsOf`, the one path every call of a client takes: the client
 * hands out the agent of a caller there, and refuses one once it is disposed.
 * No entry exports it, so it is read from `client.js` beside the entry that
 * `@ic-reactor/core` resolves to, the module that entry itself imports and the
 * only one that knows its clients.
 *
 * TODO(IR2t, #782): call through core's public canister builder once it has
 * one.
 */
async function callPathOf(client: Client): Promise<CallPath> {
  const entry = createRequire(import.meta.url).resolve("@ic-reactor/core")
  const internal = (await import(
    new URL("client.js", pathToFileURL(entry)).href
  )) as { internalsOf(client: Client): CallPath }
  return internal.internalsOf(client)
}

/**
 * Sends a query through `client` as its caller now, and resolves once the
 * replica answered. A disposed client rejects it before it is sent, as a
 * `cancelled` error with the code `client_disposed`.
 */
export async function callThrough(client: Client): Promise<void> {
  const callPath = await callPathOf(client)
  const agent = await callPath.agentFor(client.caller(), {
    method: "ping",
    canisterId: CANISTER,
  })
  const response = await agent.query(CANISTER, {
    methodName: "ping",
    arg: EMPTY,
  })
  if (String(response.status) !== "replied") {
    throw new Error(`the query was not answered: ${String(response.status)}`)
  }
}
