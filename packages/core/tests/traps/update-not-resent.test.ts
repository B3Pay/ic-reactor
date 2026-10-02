/**
 * Trap: an update sent again after a failure that does not say it never ran.
 *
 * The mistake a hand-written integration makes: it wraps the call in a retry
 * ("three attempts, back off"), or leaves the agent's own retries on. Every
 * attempt of an update is a new request with a new id, so the Internet
 * Computer cannot tell a retry from a second payment and runs both. A
 * canister that rejected with code 4 keeps what it changed, one that trapped
 * (code 5) may have committed some of it before the trap, a reply that was
 * lost on its way back came from a canister that ran, and an HTTP 408 or 5xx
 * may follow a delivery: re-sending after any of them can pay twice.
 *
 * The guarantee: after reject code 4, reject code 5, a lost reply, HTTP 408
 * and HTTP 5xx, exactly one request was sent, however long the client waits
 * (it waits past both of its re-send delays, 300 ms and 600 ms, before it
 * looks), and the failure says `mayHaveExecuted: true` so the app reads the
 * balance back before it offers to try again. The cases where a re-send is
 * safe, and made, are in `update-resent-when-never-delivered.test.ts`.
 */
import { MutationObserver } from "@tanstack/query-core"
import { afterAll, describe, expect, it } from "vitest"
import {
  ALICE,
  FEE,
  disposeAll,
  pastResendDelays,
  rejection,
  setupLedger,
  transferArg,
} from "./ledger.js"

afterAll(disposeAll)

// One flat suite, so that the waits of its tests overlap: each sits out the
// client's re-send delays, and one after another they would take seconds.
describe.concurrent("an update that may have run", () => {
  it.each([
    [4, "refused after the debit", false],
    [5, "trapped after the debit", true],
  ] as const)(
    "is never re-sent after reject code %i, so the ledger debits once",
    async (code, message, trap) => {
      const l = setupLedger()
      l.onTransfer((apply) => {
        apply()
        if (trap) throw new Error(message)
        return l.reject(code, message)
      })

      const failure = await rejection(
        l.ledger.icrc1_transfer(transferArg(500n))
      )
      await pastResendDelays()

      expect(failure).toMatchObject({
        kind: "rejected",
        rejectCode: code,
        mayHaveExecuted: true,
      })
      expect(l.calls()).toHaveLength(1)
      expect(l.executed()).toBe(1)
      expect(l.balances.get(ALICE)).toBe(1_000_000n - 500n - FEE)
    }
  )

  it("is never re-sent after its reply was lost, so the ledger debits once", async () => {
    const l = setupLedger()
    l.dropNextReply()

    const failure = await rejection(l.ledger.icrc1_transfer(transferArg(500n)))
    await pastResendDelays()

    // The ledger ran it: the reply was lost, not the call.
    expect(failure).toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    expect(l.calls()).toMatchObject([{ dropped: true }])
    expect(l.executed()).toBe(1)
    expect(l.balances.get(ALICE)).toBe(1_000_000n - 500n - FEE)
  })

  it("is never re-sent after a mutation lost its reply: retry is off", async () => {
    const l = setupLedger()
    l.dropNextReply()
    const mutation = new MutationObserver(
      l.client.queryClient,
      l.client.mutationOptions(l.ledger, "icrc1_transfer")
    )

    await mutation.mutate(transferArg(500n)).catch(() => undefined)
    await pastResendDelays()

    expect(mutation.getCurrentResult()).toMatchObject({
      status: "error",
      failureCount: 1,
      error: { kind: "outcome_unknown", mayHaveExecuted: true },
    })
    expect(l.calls()).toHaveLength(1)
    expect(l.executed()).toBe(1)
  })

  it.each([408, 500, 502, 503])(
    "is never re-sent after HTTP %i",
    async (status) => {
      const l = setupLedger()
      l.refuseNext(status)

      const failure = await rejection(
        l.ledger.icrc1_transfer(transferArg(500n))
      )
      await pastResendDelays()

      // The client cannot tell whether a timeout or a gateway error came
      // before or after the call reached a canister, so it says "may have".
      expect(failure).toMatchObject({
        kind: "outcome_unknown",
        httpStatus: status,
        mayHaveExecuted: true,
      })
      expect(l.calls()).toHaveLength(1)
    }
  )
})
