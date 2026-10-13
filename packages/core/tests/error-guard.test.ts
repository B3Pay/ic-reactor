/**
 * `isReactorError(error, canister, method)`: the guard that narrows `err` to a
 * method's `Err` arm. It checks at run time that the error came from a call
 * of that method on that canister object, so it never hands an app another
 * call's error typed as this one's.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { c, principal } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import type { QueryFunctionContext } from "@tanstack/query-core"
import { isReactorError } from "../src/index.js"
import { createReactorError, fromCanister } from "../src/errors.js"
import {
  LEDGER,
  SHAPES,
  clientAs,
  ledgerCanister,
  replicaWith,
  serve,
} from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

const alice = Ed25519KeyIdentity.generate()
const BOB = principal(Ed25519KeyIdentity.generate().getPrincipal().toText())
const OTHER_LEDGER = "qoctq-giaaa-aaaaa-aaaea-cai"

/** A transfer to Bob that Alice, who holds nothing, cannot pay for. */
const transfer: icrc1.TransferArg = {
  to: { owner: BOB, subaccount: null },
  amount: 1n,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
}

/** Two ledgers and the shapes service on one replica, called as Alice. */
function setup() {
  const replica = replicaWith({
    [LEDGER]: ledgerCanister(new Map()),
    [OTHER_LEDGER]: ledgerCanister(new Map()),
    [SHAPES]: serve<shapes.Actor>(shapes.actor, {
      outcome: ([n]) =>
        n === 0n ? { tag: "err", value: "zero" } : { tag: "ok", value: n },
    }),
  })
  const client = clientAs(replica, alice)
  return {
    replica,
    client,
    ledger: client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER }),
    shapes: client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
  }
}

const caught = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected the call to reject")
    },
    (error: unknown) => error
  )

describe("isReactorError(error, canister, method)", () => {
  it("is true for an error of that method on that canister, with the Err arm in err", async () => {
    const { ledger } = setup()
    const error = await caught(ledger.icrc1_transfer(transfer))

    expect(error).toMatchObject({ kind: "canister_err" })
    expect(isReactorError(error, ledger, "icrc1_transfer")).toBe(true)
    if (
      isReactorError(error, ledger, "icrc1_transfer") &&
      error.kind === "canister_err"
    ) {
      expect(error.err).toEqual({
        tag: "InsufficientFunds",
        value: { balance: 0n },
      })
    }
    // The one-argument form still holds for it (point-free use is the next
    // test's).
    expect(isReactorError(error)).toBe(true)
    // An error the call made before sending anything is that call's too.
    const readOnly = clientAs(
      replicaWith({ [LEDGER]: ledgerCanister(new Map()) }),
      "anonymous"
    ).canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const refused = await caught(readOnly.icrc1_transfer(transfer))
    expect(refused).toMatchObject({ kind: "unauthenticated" })
    expect(isReactorError(refused, readOnly, "icrc1_transfer")).toBe(true)
  })

  it("stays the one-argument guard when passed point-free to an array method", async () => {
    const { ledger } = setup()
    const error = await caught(ledger.icrc1_transfer(transfer))
    const plain = new Error("not a ReactorError")
    const errors = [error, plain]

    // filter, some, find and every call it with (element, index, array).
    expect(errors.filter(isReactorError)).toEqual([error])
    expect(errors.some(isReactorError)).toBe(true)
    expect(errors.find(isReactorError)).toBe(error)
    expect([error].every(isReactorError)).toBe(true)
    expect([plain].some(isReactorError)).toBe(false)
  })

  it("is false for an error of another method of the same canister", async () => {
    const { ledger } = setup()
    const error = await caught(ledger.icrc1_transfer(transfer))

    expect(isReactorError(error, ledger, "icrc1_balance_of")).toBe(false)
    expect(isReactorError(error, ledger, "icrc1_fee")).toBe(false)
  })

  it("is false for an error of the same method called through another canister object or a func reference", async () => {
    const { client, ledger } = setup()
    const error = await caught(ledger.icrc1_transfer(transfer))

    // Another ledger, the certified canister of the same ledger, and the
    // same ledger made by another client are other canister objects.
    const other = client.canister<icrc1.Actor>(icrc1.actor, {
      id: OTHER_LEDGER,
    })
    const certified = client.canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
      certified: true,
    })
    const elsewhere = setup().ledger
    expect(isReactorError(error, other, "icrc1_transfer")).toBe(false)
    expect(isReactorError(error, certified, "icrc1_transfer")).toBe(false)
    expect(isReactorError(error, elsewhere, "icrc1_transfer")).toBe(false)

    // The same object again: client.canister() returns it for the same target.
    const again = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    expect(again).toBe(ledger)
    expect(isReactorError(error, again, "icrc1_transfer")).toBe(true)

    // A func reference to the same method is not a call on a canister object.
    const transferFn = client.func<(arg: icrc1.TransferArg) => Promise<bigint>>(
      c.func([icrc1.TransferArg], [icrc1.TransferResult], "update"),
      {
        principal: principal(LEDGER),
        method: "icrc1_transfer",
      }
    )
    const fromFunc = await caught(transferFn(transfer))
    expect(fromFunc).toMatchObject({
      kind: "canister_err",
      method: "icrc1_transfer",
      canisterId: LEDGER,
    })
    expect(isReactorError(fromFunc)).toBe(true)
    expect(isReactorError(fromFunc, ledger, "icrc1_transfer")).toBe(false)
  })

  it("is true for the errors of a read's query function and a mutation function built from the canister", async () => {
    const { client, ledger, shapes: service } = setup()

    const read = client.queryOptions(service, "outcome", 0n)
    const readError = await caught(
      read.queryFn({
        signal: new AbortController().signal,
      } as QueryFunctionContext)
    )
    expect(readError).toMatchObject({ kind: "canister_err", err: "zero" })
    expect(isReactorError(readError, service, "outcome")).toBe(true)

    const write = client.mutationOptions(ledger, "icrc1_transfer")
    const writeError = await caught(write.mutationFn(transfer))
    expect(writeError).toMatchObject({ kind: "canister_err" })
    expect(isReactorError(writeError, ledger, "icrc1_transfer")).toBe(true)
  })

  it("is false when only one of the canister and the method is given", async () => {
    const { ledger } = setup()
    const error = await caught(ledger.icrc1_transfer(transfer))
    const untyped = isReactorError as (...args: unknown[]) => boolean

    expect(untyped(error, undefined, "icrc1_transfer")).toBe(false)
    expect(untyped(error, ledger)).toBe(false)
    expect(untyped(error, ledger, undefined)).toBe(false)
    // An error no canister marked (a func reference's) has no canister to
    // match a missing one.
    const unmarked = createReactorError("cancelled", {
      method: "icrc1_transfer",
      canisterId: LEDGER,
    })
    expect(untyped(unmarked)).toBe(true)
    expect(untyped(unmarked, undefined, "icrc1_transfer")).toBe(false)
    expect(untyped(unmarked, null, "icrc1_transfer")).toBe(false)
  })

  it("keeps the first canister an error was marked with", () => {
    const { ledger } = setup()
    const other = setup().ledger
    const error = createReactorError("cancelled", {
      method: "icrc1_transfer",
      canisterId: LEDGER,
    })

    expect(fromCanister(error, ledger)).toBe(error)
    expect(fromCanister(error, other)).toBe(error)
    expect(isReactorError(error, ledger, "icrc1_transfer")).toBe(true)
    expect(isReactorError(error, other, "icrc1_transfer")).toBe(false)
    // The mark is not a field of the error: no key lists it, and a spread
    // copy does not carry it.
    expect(Object.getOwnPropertySymbols({ ...error })).toEqual([])
    expect(Object.keys(error)).toEqual(
      Object.keys(
        createReactorError("cancelled", {
          method: "icrc1_transfer",
          canisterId: LEDGER,
        })
      )
    )
  })
})
