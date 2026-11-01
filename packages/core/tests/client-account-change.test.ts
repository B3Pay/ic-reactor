/**
 * What a sign-out, an expired session and a switch of account leave in the
 * client's cache: the new caller's reads and the anonymous ones, and nothing
 * read as anyone else.
 *
 * A key carries its caller, so the next caller's reads never meet the
 * previous one's. Removing the previous one's as well keeps them out of the
 * next person's reach in a shared browser: devtools, a read by key prefix,
 * and a persister that saves the cache.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal } from "@meantjs/schema"
import { KEY_ROOT } from "../src/keys.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import {
  ANONYMOUS,
  SHAPES,
  clientWithAuth,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * A client on a fake replica whose `who` answers with its caller, signed in
 * as the identity of seed 1 unless `signedIn` is false; a read of `who`; and
 * the callers of the reads its cache holds.
 */
function setUp({ signedIn = true } = {}) {
  const replica = replicaWith({
    [SHAPES]: serve<shapes.Actor>(shapes.actor, {
      who: (_args, { caller }) => principal(caller),
    }),
  })
  const auth = createTestAuth({ seed: 1, signedIn })
  const client = clientWithAuth(replica, auth)
  const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
  const read = () =>
    client.queryClient.fetchQuery(client.queryOptions(canister, "who"))
  const callers = () =>
    client.queryClient
      .getQueryCache()
      .findAll({ queryKey: [KEY_ROOT] })
      .map((query) => query.queryKey[2])
  return { auth, client, read, callers }
}

describe("the cache after the caller changes", () => {
  it("keeps no read of a principal that signed out, and keeps the anonymous ones", async () => {
    const { client, read, callers } = setUp({ signedIn: false })
    await read()
    await client.signIn()
    const alice = client.caller()
    await expect(read()).resolves.toBe(alice)
    expect(callers()).toEqual([ANONYMOUS, alice])

    await client.signOut()

    expect(callers()).toEqual([ANONYMOUS])
    client.dispose()
  })

  it("keeps no read of the account switched away from", async () => {
    const { auth, client, read, callers } = setUp()
    const alice = client.caller()
    await read()

    auth.switchTo(2)
    const bob = client.caller()
    expect(bob).not.toBe(alice)
    expect(callers()).toEqual([])
    await expect(read()).resolves.toBe(bob)
    expect(callers()).toEqual([bob])

    // Switching back reads again: the first account's reads are gone.
    auth.switchTo(1)
    expect(callers()).toEqual([])
    client.dispose()
  })

  it.each(["expire", "elsewhere"] as const)(
    "keeps no read of a session that ends with %s()",
    async (end) => {
      const { auth, client, read, callers } = setUp()
      await read()

      auth[end]()

      expect(client.caller()).toBe(ANONYMOUS)
      expect(callers()).toEqual([])
      client.dispose()
    }
  )

  it("removes them before a listener hears of the change", async () => {
    const { client, read, callers } = setUp()
    await read()
    const seen: unknown[][] = []
    client.subscribe(() => seen.push(callers()))

    await client.signOut()

    expect(seen).toEqual([[]])
    client.dispose()
  })

  it("leaves the app's own queries, and a change of status that keeps the caller", async () => {
    const { auth, client, read, callers } = setUp()
    client.queryClient.setQueryData(["app", "theme"], "dark")
    const alice = client.caller()
    await read()

    // Signing in again as the same account keeps its reads.
    await client.signIn()
    expect(callers()).toEqual([alice])

    auth.expire()
    await read()
    expect(callers()).toEqual([ANONYMOUS])
    // Expired and then held by another tab: anonymous both times.
    auth.elsewhere()
    expect(callers()).toEqual([ANONYMOUS])
    expect(client.queryClient.getQueryData(["app", "theme"])).toBe("dark")
    client.dispose()
  })
})
