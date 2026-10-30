/**
 * `client.time()` of a test client under jsdom, where an app tests a component
 * that stamps an ICRC-1 `created_at_time` (#949).
 *
 * Under jsdom the global `Uint8Array` is jsdom's, and `TextEncoder` hands out
 * Node's. The `time` path of the `read_state` that `client.time()` sends was
 * built with it, and the agent's CBOR encoder sent that label as a map, so the
 * request the fake replica received was not the one the agent signed, and it
 * refused a signed-in caller's signature. An anonymous one carries no
 * signature, so it passes either way. Core's tests run in Node:
 * `core/tests/time-realm.test.ts` covers the same case there.
 */
import { c } from "@meantjs/schema"
import { createTestClient } from "@ic-reactor/core/testing"
import { afterEach, expect, it } from "vitest"

const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const FEE = c.service({ icrc1_fee: c.func([], [c.nat], "query") })
type Fee = { icrc1_fee: () => Promise<bigint> }

const tests: ReturnType<typeof createTestClient>[] = []
afterEach(() => {
  for (const test of tests.splice(0)) test.client.dispose()
})

it.each([false, true])(
  "resolves the replica's time with signedIn: %s",
  async (signedIn) => {
    // The case this covers: TextEncoder's bytes are not the global Uint8Array's.
    expect(new TextEncoder().encode("time")).not.toBeInstanceOf(Uint8Array)
    const test = createTestClient({ signedIn })
    tests.push(test)
    test.mock<Fee>(FEE, LEDGER, { icrc1_fee: () => 1n })
    const ledger = test.client.canister<Fee>(FEE, { id: LEDGER })

    await expect(ledger.icrc1_fee()).resolves.toBe(1n)
    await expect(test.client.time(ledger)).resolves.toEqual(expect.any(BigInt))
  }
)
