/**
 * Fixtures for the binding tests: clients that never reach a network (no test
 * here calls a canister), and a way to count the disposals of the clients a
 * provider builds.
 */
import { createClient, type AuthLike, type Client } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import { vi, type Mock } from "vitest"

/** The controllable sign-in of a test client: `signIn`, `switchTo`, `expire` and the rest. */
export type TestAuth = ReturnType<typeof createTestClient>["auth"]

/**
 * A sign-in a test controls, for the tests that build a client around it
 * themselves (to count how often the client builds its auth, or to wrap it).
 * It is the `auth` of a test client; the fake replica next to it is never
 * called, since no test here calls a canister. `identity` is a seed.
 */
export const testAuth = (
  options?: Parameters<typeof createTestClient>[0]
): TestAuth => createTestClient(options).auth

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
 * A client factory that records every client it builds, and counts the calls
 * of their `dispose()`. The client it hands out is a copy of the real one
 * (which is frozen) with a counting `dispose` in front of the real one.
 */
export function trackedFactory(build: () => Client) {
  const made: TrackedClient[] = []
  const factory = vi.fn((): Client => {
    const real = build()
    const dispose = vi.fn(() => real.dispose())
    const client: Client = { ...real, dispose }
    made.push({ client, dispose })
    return client
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
