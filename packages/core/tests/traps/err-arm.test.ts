/**
 * Trap: a refusal that resolves as a success.
 *
 * The mistake a hand-written integration makes: `icrc1_transfer` returns
 * `variant { Ok : nat; Err : TransferError }`, and an `Err` is a reply like
 * any other, so the call resolves. `await ledger.icrc1_transfer(arg)` does not
 * throw, the code after it shows "Sent!", and the refusal (`InsufficientFunds`)
 * is a value nobody read. The other way round, an app routes `Err` into its
 * error channel with an error type of its own, and every app invents another.
 *
 * The guarantee: for a method whose one result is `Ok`/`Err`, the call
 * resolves with the `Ok` payload, and the `Err` arm rejects as a
 * `ReactorError` of kind `canister_err` whose `err` is the typed `Err`
 * payload (a `TransferError`, with its `bigint` balance), and whose
 * `mayHaveExecuted` is `false`: the canister ran the call and answered with
 * its decision, so there is nothing to wonder about, and nothing is sent
 * again. A mutation reports it in its `error`, as any failure. It does
 * re-read the canister's reads afterwards, though, as it does after a
 * success (DECISIONS Q10): a canister may change state and still answer
 * `Err` (a fee for a request it refused, an attempt it recorded), and a screen
 * that kept the old balance would be as wrong as after a lost reply. The cost
 * is one read.
 */
import { MutationObserver, QueryObserver } from "@tanstack/query-core"
import { afterAll, describe, expect, it } from "vitest"
import { isReactorError } from "../../src/index.js"
import {
  ALICE,
  FEE,
  disposeAll,
  eventually,
  pastResendDelays,
  rejection,
  setupLedger,
  transferArg,
} from "./ledger.js"

afterAll(disposeAll)

describe("the Ok and Err arms of a transfer", () => {
  it("resolves with the Ok payload, not the variant that carried it", async () => {
    const l = setupLedger()

    const block = await l.ledger.icrc1_transfer(transferArg(500n))

    expect(block).toBe(1n)
    expect(l.balances.get(ALICE)).toBe(1_000_000n - 500n - FEE)
  })

  it("rejects the Err arm as canister_err with the typed payload, and never sends it again", async () => {
    const l = setupLedger()

    const failure = await rejection(
      l.ledger.icrc1_transfer(transferArg(2_000_000n))
    )
    await pastResendDelays()

    expect(isReactorError(failure)).toBe(true)
    expect(failure).toMatchObject({
      kind: "canister_err",
      mayHaveExecuted: false,
      method: "icrc1_transfer",
    })
    if (isReactorError(failure) && failure.kind === "canister_err") {
      // The payload as the canister sent it: a variant arm and a bigint.
      expect(failure.err).toEqual({
        tag: "InsufficientFunds",
        value: { balance: 1_000_000n },
      })
    }
    expect(l.calls()).toHaveLength(1)
    expect(l.executed()).toBe(0)
  })

  it("is the error of a mutation, with the payload typed", async () => {
    const l = setupLedger()
    const mutation = new MutationObserver(
      l.client.queryClient,
      l.client.mutationOptions(l.ledger, "icrc1_transfer")
    )

    await mutation.mutate(transferArg(2_000_000n)).catch(() => undefined)

    const { status, data, error } = mutation.getCurrentResult()
    expect(status).toBe("error")
    expect(data).toBeUndefined()
    // `error` is a `ReactorError<TransferError>`: narrowing on `kind` types `err`.
    expect(error?.kind).toBe("canister_err")
    if (error?.kind === "canister_err") {
      expect(error.err.tag).toBe("InsufficientFunds")
      if (error.err.tag === "InsufficientFunds") {
        expect(error.err.value.balance).toBe(1_000_000n)
      }
    }
  })
})

describe("the reads of a canister that answered Err", () => {
  it("are read again, because a canister may change state and still answer Err", async () => {
    const l = setupLedger()
    // A ledger that charges a fee for a request it then refuses.
    l.onTransfer(() => {
      l.balances.set(ALICE, 1_000_000n - FEE)
      return {
        tag: "Err",
        value: {
          tag: "GenericError",
          value: { message: "charged for a malformed request", error_code: 7n },
        },
      }
    })
    const observer = new QueryObserver(l.client.queryClient, {
      ...l.client.queryOptions(l.ledger, "icrc1_balance_of", {
        owner: ALICE,
        subaccount: null,
      }),
      retry: false,
    })
    observer.subscribe(() => undefined)
    await eventually(() =>
      expect(observer.getCurrentResult().data).toBe(1_000_000n)
    )
    const mutation = new MutationObserver(
      l.client.queryClient,
      l.client.mutationOptions(l.ledger, "icrc1_transfer")
    )

    await mutation.mutate(transferArg(500n)).catch(() => undefined)

    expect(mutation.getCurrentResult().error).toMatchObject({
      kind: "canister_err",
      mayHaveExecuted: false,
    })
    // The screen shows the fee, which nothing in the Err said.
    await eventually(() =>
      expect(observer.getCurrentResult().data).toBe(1_000_000n - FEE)
    )
    expect(
      l.sent().filter((request) => request.methodName === "icrc1_balance_of")
    ).toHaveLength(2)
  })
})
