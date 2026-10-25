/**
 * `client.time()` where `TextEncoder`'s bytes are not the global `Uint8Array`'s,
 * as under a test's jsdom (#949).
 *
 * Under jsdom the global `Uint8Array` is jsdom's and `TextEncoder` hands out
 * Node's. Here `TextEncoder` hands out another realm's instead, which makes the
 * same mismatch in Node. The agent's CBOR encoder knows bytes by `instanceof
 * Uint8Array`, so a `time` label built from such bytes went out as a map: the
 * replica's request id was not the one the agent signed, and a signed-in
 * caller's `read_state` was refused. An anonymous one carries no signature, so
 * it passes either way. `react/tests/client-time.test.ts` runs the case under
 * jsdom itself.
 */
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { runInNewContext } from "node:vm"
import { afterEach, expect, it, vi } from "vitest"
import type { Actor } from "./fixtures/shapes.js"

const ForeignUint8Array: Uint8ArrayConstructor = runInNewContext("Uint8Array")

/** Node's encoder, with its bytes copied into another realm's array. */
class ForeignTextEncoder extends TextEncoder {
  override encode(input?: string) {
    return ForeignUint8Array.from(
      super.encode(input)
    ) as Uint8Array<ArrayBuffer>
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it.each([false, true])(
  "resolves the replica's time with signedIn: %s",
  async (signedIn) => {
    vi.stubGlobal("TextEncoder", ForeignTextEncoder)
    // The case this covers: bytes that are not the global Uint8Array's.
    expect(new TextEncoder().encode("time")).not.toBeInstanceOf(Uint8Array)
    // Evaluated again with the stub, as the client's module is under jsdom.
    vi.resetModules()
    const { createFakeReplica } = await import("../src/testing/fake-replica.js")
    const { SHAPES, clientAs, serve } = await import("./canister-helpers.js")
    const shapes = await import("./fixtures/shapes.js")

    const now = 1_000_000_000_123_456_789n
    const replica = createFakeReplica({
      canisters: {
        [SHAPES]: serve<Actor>(shapes.actor, { one: ([n]) => n + 1n }),
      },
      now: () => now,
    })
    const client = clientAs(
      replica,
      signedIn ? Ed25519KeyIdentity.generate() : "anonymous"
    )
    const canister = client.canister<Actor>(shapes.actor, { id: SHAPES })

    await expect(canister.one(1n)).resolves.toBe(2n)
    await expect(client.time(canister)).resolves.toBe(now)
  }
)
