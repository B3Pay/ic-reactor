/**
 * Trap: an update sent for nobody.
 *
 * The mistake a hand-written integration makes: it builds its agent from
 * whatever identity it has, and while a user is signed out that is the
 * anonymous one. `icrc1_transfer` then goes out as `2vxsx-fae`, a principal
 * every signed-out visitor of every app shares, and the ledger treats that
 * caller as it treats any other: it moves whatever the shared account holds.
 * Nothing in the app said "write"; nothing refused it.
 *
 * The guarantee: an update by a caller who is not signed in is refused before
 * anything is built or sent. It rejects `unauthenticated` (code
 * `anonymous_write`) with `mayHaveExecuted: false`, whether the user never
 * signed in, signed out, or lost the session in another tab, and a client
 * built with `identity: "anonymous"` is read-only. Only an explicit
 * `new AnonymousIdentity()` signs a write, so writing as nobody is a line a
 * reviewer can find.
 */
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import { MutationObserver } from "@tanstack/query-core"
import { afterAll, describe, expect, it, vi } from "vitest"
import { createClient } from "../../src/index.js"
import * as icrc1 from "../fixtures/icrc1.js"
import { fetchSpy } from "./fetch-spy.js"
import {
  ALICE,
  ANONYMOUS,
  FEE,
  LEDGER,
  SIGNED_CALLS_TIMEOUT_MS,
  disposeAll,
  rejection,
  setupLedger,
  track,
  transferArg,
} from "./ledger.js"

vi.setConfig({ testTimeout: SIGNED_CALLS_TIMEOUT_MS })
afterAll(disposeAll)

const unauthenticated = {
  kind: "unauthenticated",
  code: "anonymous_write",
  mayHaveExecuted: false,
}

describe("an update while nobody is signed in", () => {
  it("is refused before it is sent, and the ledger never hears of it", async () => {
    const { ledger, calls, executed, sent } = setupLedger({ signedIn: false })

    const failure = await rejection(ledger.icrc1_transfer(transferArg(500n)))

    expect(failure).toMatchObject(unauthenticated)
    expect(calls()).toEqual([])
    expect(executed()).toBe(0)
    // Reading needs nobody, and is signed as the anonymous principal: the
    // refusal is about writing, and the fake can see requests that are sent.
    await expect(
      ledger.icrc1_balance_of({ owner: ALICE, subaccount: null })
    ).resolves.toBe(1_000_000n)
    expect(sent()).toMatchObject([{ endpoint: "query", caller: ANONYMOUS }])
  })

  it("is refused through a mutation too, the way a component sends it", async () => {
    const { client, ledger, calls, executed } = setupLedger({ signedIn: false })
    const mutation = new MutationObserver(
      client.queryClient,
      client.mutationOptions(ledger, "icrc1_transfer")
    )

    await mutation.mutate(transferArg(500n)).catch(() => undefined)

    expect(mutation.getCurrentResult()).toMatchObject({
      status: "error",
      error: unauthenticated,
    })
    expect(calls()).toEqual([])
    expect(executed()).toBe(0)
  })

  it("is refused once the user signs out, the session expires or it is held by another tab, and goes out again after a sign-in", async () => {
    const { ledger, auth, balances, calls, executed } = setupLedger()

    // Signed in: the transfer goes out, as Alice.
    await expect(ledger.icrc1_transfer(transferArg(500n))).resolves.toBe(1n)
    expect(calls()).toMatchObject([{ caller: ALICE }])

    // Each way of no longer being signed in is refused, with nothing sent.
    for (const end of [
      () => auth.signOut(),
      () => Promise.resolve(auth.expire()),
      () => Promise.resolve(auth.elsewhere()),
    ]) {
      await auth.signIn()
      await end()
      await expect(
        rejection(ledger.icrc1_transfer(transferArg(500n)))
      ).resolves.toMatchObject(unauthenticated)
    }
    expect(calls()).toHaveLength(1)
    expect(executed()).toBe(1)

    await auth.signIn()
    await expect(ledger.icrc1_transfer(transferArg(500n))).resolves.toBe(2n)
    expect(calls()).toHaveLength(2)
    expect(balances.get(ALICE)).toBe(1_000_000n - 2n * (500n + FEE))
  })
})

describe("a client built with a fixed identity", () => {
  const network = "ic"
  const make = (identity: "anonymous" | AnonymousIdentity) => {
    const spy = fetchSpy()
    const client = track(createClient({ network, identity, fetch: spy.fetch }))
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    return { ledger, spy }
  }

  it('built with identity: "anonymous" is read-only: an update sends nothing', async () => {
    const { ledger, spy } = make("anonymous")

    await expect(
      rejection(ledger.icrc1_transfer(transferArg(500n)))
    ).resolves.toMatchObject(unauthenticated)
    expect(spy.paths).toEqual([])

    // The spy does see a read, so "nothing" above is not a blind spot.
    await rejection(ledger.icrc1_fee())
    expect(spy.paths).toEqual([
      expect.stringMatching(new RegExp(`/canister/${LEDGER}/query$`)),
    ])
  })

  it("sends an update only for an explicit AnonymousIdentity, the written-out way to write as nobody", async () => {
    const { ledger, spy } = make(new AnonymousIdentity())

    // The spy refuses it, so the call fails: what matters is that it was sent.
    await expect(
      rejection(ledger.icrc1_transfer(transferArg(500n)))
    ).resolves.toMatchObject({ kind: "not_delivered", httpStatus: 400 })
    expect(spy.paths).toEqual([
      expect.stringMatching(new RegExp(`/canister/${LEDGER}/call$`)),
    ])
  })
})
