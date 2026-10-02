/**
 * Trap: an update that was never delivered, given up on, or sent again as
 * someone else.
 *
 * The mistake a hand-written integration makes, in either direction. A cautious
 * one never sends an update twice, so a transfer the replica turned away (it
 * was rate limited, HTTP 429, or the subnet was busy, reject code 2) fails for
 * the user although a moment later it would have gone through. A careless one
 * sends again after anything, and its re-send goes out as whoever is signed in
 * by then.
 *
 * The guarantee: after the two failures that prove the update never got in,
 * reject code 2 (SYS_TRANSIENT) and HTTP 429, the client sends it again, at
 * most twice (after 300 ms, then 600 ms), and resolves with the reply of the
 * attempt that went through, with the ledger booking it once. Each re-send is
 * made for the caller of the first attempt: a user who switched account in
 * the meantime does not pay for it, the call is cancelled instead. To the
 * management canister `aaaaa-aa`, whose rejects prove nothing about what ran,
 * an update is never sent again. Failures that do not prove non-delivery are
 * in `update-not-resent.test.ts`.
 */
import { principal } from "@candid-core/schema"
import { MutationObserver } from "@tanstack/query-core"
import { afterAll, describe, expect, it } from "vitest"
import * as management from "../fixtures/management.js"
import {
  ALICE,
  BOB,
  FEE,
  SHOP,
  disposeAll,
  eventually,
  pastResendDelays,
  rejection,
  setupLedger,
  transferArg,
} from "./ledger.js"

afterAll(disposeAll)

// One flat suite, so that the waits of its tests overlap.
describe.concurrent("an update that was never delivered", () => {
  it("is sent again once after reject code 2, and the ledger books it once", async () => {
    const l = setupLedger()
    let attempts = 0
    l.onTransfer((apply) => {
      attempts += 1
      // The first attempt is turned away before any canister code ran.
      return attempts === 1 ? l.reject(2, "the subnet is busy") : apply()
    })

    await expect(l.ledger.icrc1_transfer(transferArg(500n))).resolves.toBe(1n)

    expect(attempts).toBe(2)
    expect(l.calls()).toHaveLength(2)
    expect(l.executed()).toBe(1)
    expect(l.balances.get(ALICE)).toBe(1_000_000n - 500n - FEE)
  })

  it("is sent again once after HTTP 429, and the ledger books it once", async () => {
    const l = setupLedger()
    l.refuseNext(429)

    await expect(l.ledger.icrc1_transfer(transferArg(500n))).resolves.toBe(1n)

    expect(l.calls()).toMatchObject([
      { refused: expect.stringContaining("429") },
      { methodName: "icrc1_transfer", caller: ALICE },
    ])
    expect(l.executed()).toBe(1)
    expect(l.balances.get(ALICE)).toBe(1_000_000n - 500n - FEE)
  })

  it("is sent again at most twice, and then fails as not delivered", async () => {
    const l = setupLedger()
    l.refuseNext(429, 5)

    const failure = await rejection(l.ledger.icrc1_transfer(transferArg(500n)))
    await pastResendDelays()

    expect(failure).toMatchObject({
      kind: "not_delivered",
      httpStatus: 429,
      mayHaveExecuted: false,
    })
    // The first attempt and two re-sends; nothing booked.
    expect(l.calls()).toHaveLength(3)
    expect(l.executed()).toBe(0)
  })

  it("is sent again by a mutation, which TanStack Query does not retry on top", async () => {
    const l = setupLedger()
    l.refuseNext(429)
    const mutation = new MutationObserver(
      l.client.queryClient,
      l.client.mutationOptions(l.ledger, "icrc1_transfer")
    )

    await mutation.mutate(transferArg(500n))

    // Two requests came from one attempt of the mutation: TanStack's retry is
    // off, and the client's own re-send does not count as a failure.
    expect(mutation.getCurrentResult()).toMatchObject({
      status: "success",
      data: 1n,
      failureCount: 0,
    })
    expect(l.calls()).toHaveLength(2)
    expect(l.executed()).toBe(1)
  })

  it("is not sent again as somebody else when the account is switched during the wait", async () => {
    const l = setupLedger()
    l.refuseNext(429)

    const sending = rejection(l.ledger.icrc1_transfer(transferArg(500n)))
    // The first attempt was refused; the client waits 300 ms to send again.
    await eventually(() => expect(l.calls()).toHaveLength(1))
    l.auth.switchTo(2)
    const failure = await sending
    await pastResendDelays()

    expect(failure).toMatchObject({
      kind: "cancelled",
      mayHaveExecuted: false,
    })
    // Nothing was sent for Bob, who was signed in when the wait ended, and
    // nothing again for Alice: the one request is the first, refused one.
    expect(l.calls()).toMatchObject([
      { refused: expect.stringContaining("429") },
    ])
    expect(l.calls().filter((call) => call.caller === BOB)).toEqual([])
    expect(l.executed()).toBe(0)
    expect(l.balances.get(BOB)).toBe(500_000n)
    expect(l.balances.get(ALICE)).toBe(1_000_000n)
  })

  it("is never sent again to the management canister, where reject code 2 proves nothing", async () => {
    const l = setupLedger()
    l.mock<management.Actor>(management.actor, "aaaaa-aa", {
      start_canister: () => l.reject(2, "the subnet is busy"),
    })
    const ic = l.client.canister<management.Actor>(management.actor, {
      id: "aaaaa-aa",
    })

    const failure = await rejection(
      ic.start_canister({ canister_id: principal(SHOP) })
    )
    await pastResendDelays()

    // A stop_canister rejected with code 2 may have taken effect, so the call
    // says "may have executed" and is left to the app.
    expect(failure).toMatchObject({ kind: "rejected", mayHaveExecuted: true })
    expect(l.calls()).toHaveLength(1)
  })
})
