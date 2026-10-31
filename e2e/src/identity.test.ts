/**
 * An identity switch between two Ed25519 identities on one client: the caller
 * the canister sees changes, and so do the query keys, and the reads of the
 * identity that left are removed from the cache.
 */
import { createClient } from "@ic-reactor/core"
import { describe, expect, it } from "vitest"
import { actor, type Actor } from "./declarations/hello_actor"
import { ed25519, network, switchableAuth, target } from "./replica"

describe("an identity switch on the local replica", () => {
  it("calls as the identity signed in now, under that principal's keys", async () => {
    const alice = ed25519()
    const bob = ed25519()
    const aliceText = alice.getPrincipal().toText()
    const bobText = bob.getPrincipal().toText()
    expect(aliceText).not.toBe(bobText)

    const { auth, switchTo } = switchableAuth(alice)
    const client = createClient({ network, auth: () => auth })
    try {
      const hello = client.canister<Actor>(actor, target)

      expect(client.caller()).toBe(aliceText)
      await expect(hello.whoami()).resolves.toBe(aliceText)
      const aliceOptions = client.queryOptions(hello, "whoami")
      expect(aliceOptions.queryKey[2]).toBe(aliceText)
      await expect(client.queryClient.fetchQuery(aliceOptions)).resolves.toBe(
        aliceText
      )

      switchTo(bob)

      expect(client.caller()).toBe(bobText)
      // Signed by Bob's key now: the canister sees his principal.
      await expect(hello.whoami()).resolves.toBe(bobText)
      const bobOptions = client.queryOptions(hello, "whoami")
      expect(bobOptions.queryKey[2]).toBe(bobText)
      expect(bobOptions.queryKey).not.toEqual(aliceOptions.queryKey)
      // Alice's answer is not served to Bob: the switch removed it.
      expect(
        client.queryClient.getQueryData(aliceOptions.queryKey)
      ).toBeUndefined()
      expect(
        client.queryClient.getQueryData(bobOptions.queryKey)
      ).toBeUndefined()
      await expect(client.queryClient.fetchQuery(bobOptions)).resolves.toBe(
        bobText
      )

      // And back: Bob's answer goes the same way.
      switchTo(alice)
      expect(
        client.queryClient.getQueryData(bobOptions.queryKey)
      ).toBeUndefined()
      await expect(hello.whoami()).resolves.toBe(aliceText)
    } finally {
      client.dispose()
    }
  })
})
