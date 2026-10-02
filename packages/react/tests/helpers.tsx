/**
 * Fixtures for the binding tests: clients that never reach a network, a way
 * to count the disposals of the clients a provider is given, and clients of a
 * fake replica with one call to send through them.
 */
import { createClient, type AuthLike, type Client } from "@ic-reactor/core"
import { createFakeReplica, type FakeReplica } from "@ic-reactor/core/testing"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { vi, type Mock } from "vitest"

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

/** The canister {@link callThrough} calls. */
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** Candid's empty argument and reply, `()`. */
const EMPTY = new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0, 0])

/** A fake replica, and the callers its canister saw. */
export function replicaWithCanister(): {
  readonly replica: FakeReplica
  readonly callers: string[]
} {
  const callers: string[] = []
  const replica = createFakeReplica({
    canisters: {
      [CANISTER]: {
        query: (_method, _arg, { caller }) => {
          callers.push(caller.toText())
          return EMPTY
        },
      },
    },
  })
  return { replica, callers }
}

/** A client of `replica` whose caller is whatever `auth` says. */
export const clientOn = (replica: FakeReplica, auth: () => AuthLike): Client =>
  createClient({
    network: { host: replica.host, rootKey: replica.rootKey },
    fetch: replica.fetch,
    auth,
  })

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
