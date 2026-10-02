/**
 * Trap: a screen that keeps showing money that has already moved.
 *
 * The mistake a hand-written integration makes: it refreshes the balance in
 * `onSuccess`. A transfer whose reply is lost (the connection drops, a
 * gateway times out) is neither a success nor a known failure: the ledger may
 * have booked it, the mutation fails, nothing refreshes, and the screen shows
 * the old balance next to an error that says "failed". The user presses Send
 * again and pays twice. The opposite habit, refreshing after every failure,
 * is not free: a refusal that provably changed nothing costs a read.
 *
 * The guarantee: `client.mutationOptions` invalidates the reads of the
 * canister it wrote to, and waits for the active ones to refetch, after a
 * success and after every failure that may have executed (a lost reply, a
 * reject code 4 or 5, HTTP 408 or 5xx), so the screen shows what the ledger
 * holds. After a failure that proves nothing ran (arguments that do not
 * encode, a user who is not signed in, a refusal before the replica took it
 * in, a reject code 1 or 3) it re-reads nothing. The app writes no
 * `invalidates` for any of it; the case of an `Err` is in
 * `err-arm.test.ts`.
 */
import { MutationObserver, QueryObserver } from "@tanstack/query-core"
import { afterAll, describe, expect, it, vi } from "vitest"
import {
  ALICE,
  FEE,
  SIGNED_CALLS_TIMEOUT_MS,
  disposeAll,
  eventually,
  setupLedger,
  transferArg,
  type Ledger,
} from "./ledger.js"

vi.setConfig({ testTimeout: SIGNED_CALLS_TIMEOUT_MS })
afterAll(disposeAll)

/** A component showing Alice's balance, and how many times the ledger was asked for it. */
function showBalance(l: Ledger) {
  const observer = new QueryObserver(l.client.queryClient, {
    ...l.client.queryOptions(l.ledger, "icrc1_balance_of", {
      owner: ALICE,
      subaccount: null,
    }),
    retry: false,
  })
  observer.subscribe(() => undefined)
  return {
    reads: () =>
      l.sent().filter((request) => request.methodName === "icrc1_balance_of")
        .length,
    shows: (balance: bigint) =>
      eventually(() => expect(observer.getCurrentResult().data).toBe(balance)),
    shown: () => observer.getCurrentResult().data,
  }
}

/** Sends a transfer as a component would, and resolves once the mutation has settled. */
async function send(l: Ledger, amount: bigint) {
  const mutation = new MutationObserver(
    l.client.queryClient,
    l.client.mutationOptions(l.ledger, "icrc1_transfer")
  )
  await mutation.mutate(transferArg(amount)).catch(() => undefined)
  return mutation.getCurrentResult()
}

const START = 1_000_000n

describe("a write that may have run", () => {
  it.each([
    {
      name: "its reply was lost",
      arrange: (l: Ledger) => l.dropNextReply(),
      books: true,
    },
    {
      name: "the ledger rejected it with code 4 after booking it",
      arrange: (l: Ledger) =>
        l.onTransfer((apply) => {
          apply()
          return l.reject(4, "stuck after the debit")
        }),
      books: true,
    },
    {
      // The ledger never saw it, but a gateway error cannot say so.
      name: "the gateway answered HTTP 503",
      arrange: (l: Ledger) => l.refuseNext(503),
      books: false,
    },
  ])(
    "re-reads the balance once, so the screen shows what the ledger holds, when $name",
    async ({ arrange, books }) => {
      const l = setupLedger()
      const balance = showBalance(l)
      await balance.shows(START)
      expect(balance.reads()).toBe(1)
      arrange(l)

      const result = await send(l, 500n)

      expect(result).toMatchObject({
        status: "error",
        error: { mayHaveExecuted: true },
      })
      const held = books ? START - 500n - FEE : START
      await balance.shows(held)
      expect(l.executed()).toBe(books ? 1 : 0)
      expect(l.balances.get(ALICE)).toBe(held)
      expect(balance.reads()).toBe(2)
    }
  )

  it("re-reads the balance after a success too, with nothing listed by the app", async () => {
    const l = setupLedger()
    const balance = showBalance(l)
    await balance.shows(START)

    const result = await send(l, 500n)

    expect(result).toMatchObject({ status: "success", data: 1n })
    await balance.shows(START - 500n - FEE)
    expect(balance.reads()).toBe(2)
  })
})

describe("a write that provably did not run", () => {
  it.each([
    {
      name: "its arguments do not encode",
      arrange: () => undefined,
      amount: -1n,
      kind: "invalid_args",
    },
    {
      name: "the replica refused it with HTTP 400",
      arrange: (l: Ledger) => l.refuseNext(400),
      amount: 500n,
      kind: "not_delivered",
    },
    {
      name: "the subnet rejected it with code 1 before any code ran",
      arrange: (l: Ledger) =>
        l.onTransfer(() => l.reject(1, "the subnet is shutting down")),
      amount: 500n,
      kind: "rejected",
    },
  ])("re-reads nothing when $name", async ({ arrange, amount, kind }) => {
    const l = setupLedger()
    const balance = showBalance(l)
    await balance.shows(START)
    arrange(l)

    const result = await send(l, amount)

    expect(result).toMatchObject({
      status: "error",
      error: { kind, mayHaveExecuted: false },
    })
    expect(balance.reads()).toBe(1)
    expect(balance.shown()).toBe(START)
  })

  it("re-reads nothing when nobody is signed in", async () => {
    const l = setupLedger({ signedIn: false })
    const balance = showBalance(l)
    await balance.shows(START)

    const result = await send(l, 500n)

    expect(result).toMatchObject({
      status: "error",
      error: { kind: "unauthenticated", mayHaveExecuted: false },
    })
    expect(balance.reads()).toBe(1)
  })
})
