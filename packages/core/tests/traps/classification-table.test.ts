/**
 * Trap: a failed write that is reported as one thing and means another.
 *
 * The mistake a hand-written integration makes: it shows "failed" for every
 * error, or reads the reject code itself and gets the table wrong. Either way
 * the user who retries a transfer that actually went through pays twice, and
 * the user who is told "may have gone through" about a refusal waits for money
 * that never moved. The question after a failed write is not what went wrong
 * but whether it happened anyway.
 *
 * The guarantee: every failure a ledger call can end with is a `ReactorError`
 * whose `kind` and `mayHaveExecuted` follow one table, for an update and, with
 * the differences a read has, for a query. This file drives every row an app
 * can provoke through a mocked ledger (reject codes 1 to 6, HTTP 400, 408, 429
 * and 503, a lost reply, a reply that does not decode, an `Err` arm) through
 * the whole stack, and checks the one property the table exists for: when the
 * ledger's books changed, the error says `mayHaveExecuted: true`.
 *
 * Rows it leaves out: the management canister's rejects and a re-send
 * cancelled by an account switch are in
 * `update-resent-when-never-delivered.test.ts`; failures only the agent itself
 * produces (a polling timeout, a `Trust` failure, `IngressExpiryInvalid`, a
 * request that cannot be built or signed) are covered as pure functions of
 * agent errors in `errors.test.ts`.
 */
import { c } from "@candid-core/schema"
import { afterAll, describe, expect, it } from "vitest"
import { isReactorError, type ReactorErrorKind } from "../../src/index.js"
import * as icrc1 from "../fixtures/icrc1.js"
import {
  ALICE,
  LEDGER,
  disposeAll,
  rejection,
  setupLedger,
  transferArg,
  type Ledger,
} from "./ledger.js"

afterAll(disposeAll)

/** The ways a call fails, as an app meets them. */
type Failure =
  | { readonly reject: 1 | 2 | 3 | 4 | 5 | 6 }
  | { readonly http: number }
  | "a lost reply"
  | "a reply that does not decode"
  | "an Err arm"

/** What the error must say: its `kind`, and whether the call may have executed. */
type Verdict = readonly [kind: ReactorErrorKind, mayHaveExecuted: boolean]

/**
 * The table. A read has no `a lost reply` (the fake loses the reply of an
 * update), and no `an Err arm` (a ledger's reads have no result variant).
 */
const TABLE: readonly {
  readonly failure: Failure
  readonly update: Verdict
  readonly query?: Verdict
}[] = [
  // Reject codes 1 and 3: rejected before any canister code ran.
  {
    failure: { reject: 1 },
    update: ["rejected", false],
    query: ["rejected", false],
  },
  {
    failure: { reject: 3 },
    update: ["rejected", false],
    query: ["rejected", false],
  },
  // Code 2 is sent again (twice); this is what it ends as when the subnet stays busy.
  {
    failure: { reject: 2 },
    update: ["not_delivered", false],
    query: ["not_delivered", false],
  },
  // Codes 4 and 5: the canister ran, and may have changed its state first.
  {
    failure: { reject: 4 },
    update: ["rejected", true],
    query: ["rejected", false],
  },
  {
    failure: { reject: 5 },
    update: ["rejected", true],
    query: ["rejected", false],
  },
  // Code 6 is the interface specification's "unknown outcome".
  {
    failure: { reject: 6 },
    update: ["outcome_unknown", true],
    query: ["not_delivered", false],
  },
  // A refusal of the request itself proves it never ran; a timeout or a gateway error does not.
  {
    failure: { http: 429 },
    update: ["not_delivered", false],
    query: ["not_delivered", false],
  },
  {
    failure: { http: 400 },
    update: ["not_delivered", false],
    query: ["not_delivered", false],
  },
  {
    failure: { http: 408 },
    update: ["outcome_unknown", true],
    query: ["not_delivered", false],
  },
  {
    failure: { http: 503 },
    update: ["outcome_unknown", true],
    query: ["not_delivered", false],
  },
  { failure: "a lost reply", update: ["outcome_unknown", true] },
  {
    failure: "a reply that does not decode",
    update: ["invalid_reply", true],
    query: ["invalid_reply", false],
  },
  { failure: "an Err arm", update: ["canister_err", false] },
]

const nameOf = (failure: Failure): string =>
  typeof failure === "string"
    ? failure
    : "reject" in failure
      ? `reject code ${failure.reject}`
      : `HTTP ${failure.http}`

/** Whether the ledger has booked the transfer by the time the call fails this way. */
const booksTransfer = (failure: Failure): boolean =>
  failure === "a lost reply" ||
  failure === "a reply that does not decode" ||
  (typeof failure === "object" &&
    "reject" in failure &&
    (failure.reject === 4 || failure.reject === 5))

/** Makes the next call fail as `failure` says. */
function arrange(l: Ledger, failure: Failure, call: "update" | "query"): void {
  if (failure === "a lost reply") return l.dropNextReply()
  if (typeof failure !== "object") return
  // Three refusals: a read is sent again twice, and must see it through.
  if ("http" in failure) return l.refuseNext(failure.http, 3)
  const { reject } = failure
  const message = `rejected with code ${reject}`
  if (call === "query") return l.beforeRead(() => l.reject(reject, message))
  l.onTransfer((apply) => {
    // A canister that rejects with 4 or traps with 5 has often booked it.
    if (booksTransfer(failure)) apply()
    return l.reject(reject, message)
  })
}

/**
 * What an app whose generated module is out of date calls: the same ledger,
 * but `icrc1_balance_of` and `icrc1_transfer` are declared to answer `text`,
 * while the deployed ledger answers `nat`. Every reply fails to decode, after
 * the ledger ran.
 */
const outOfDate = c.service({
  icrc1_balance_of: c.func([icrc1.Account], [c.text], "query"),
  icrc1_transfer: c.func([icrc1.TransferArg], [c.text], "update"),
})
interface OutOfDate {
  icrc1_balance_of(arg: icrc1.Account): Promise<string>
  icrc1_transfer(arg: icrc1.TransferArg): Promise<string>
}

/** The ledger an app calls to see `failure`: the stale one for a reply that does not decode. */
function ledgerFor(l: Ledger, failure: Failure) {
  return failure === "a reply that does not decode"
    ? l.client.canister<OutOfDate>(outOfDate, { id: LEDGER })
    : l.ledger
}

/** Whichever code or status the failure names, for the error to carry. */
const carried = (failure: Failure) =>
  typeof failure !== "object"
    ? {}
    : "reject" in failure
      ? { rejectCode: failure.reject }
      : { httpStatus: failure.http }

const verdict = ([kind, mayHaveExecuted]: Verdict) => ({
  kind,
  mayHaveExecuted,
})

const ROWS = TABLE.map((row) => ({ ...row, name: nameOf(row.failure) }))

// One flat suite, so that the waits of its tests overlap: some rows are sent
// again after 300 ms and 600 ms before they end.
describe.concurrent("every way a call can fail", () => {
  it.each(ROWS)("$name, as an update", async ({ failure, update }) => {
    const l = setupLedger()
    arrange(l, failure, "update")
    // The Err row asks for more than the account holds.
    const amount = failure === "an Err arm" ? 2_000_000n : 500n

    const error = await rejection(
      ledgerFor(l, failure).icrc1_transfer(transferArg(amount))
    )

    expect(isReactorError(error)).toBe(true)
    expect(error).toMatchObject({ ...verdict(update), ...carried(failure) })
    // What really happened, and what the error must never contradict.
    expect(l.executed() > 0).toBe(booksTransfer(failure))
    if (l.executed() > 0) {
      expect(error).toMatchObject({ mayHaveExecuted: true })
    }
  })

  it.each(ROWS.filter(({ query }) => query !== undefined))(
    "$name, as a read",
    async ({ failure, query }) => {
      const l = setupLedger()
      arrange(l, failure, "query")

      const error = await rejection(
        ledgerFor(l, failure).icrc1_balance_of({
          owner: ALICE,
          subaccount: null,
        })
      )

      expect(isReactorError(error)).toBe(true)
      expect(error).toMatchObject({
        ...verdict(query as Verdict),
        ...carried(failure),
      })
    }
  )

  it("a canister id nobody runs, as an update, is rejected before any code ran", async () => {
    const l = setupLedger()
    const nobody = l.client.canister<icrc1.Actor>(icrc1.actor, {
      id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    })

    const error = await rejection(nobody.icrc1_transfer(transferArg(500n)))

    // The replica rejects with DESTINATION_INVALID: no such canister, so
    // nothing ran, and it is not sent again.
    expect(error).toMatchObject({
      kind: "rejected",
      rejectCode: 3,
      mayHaveExecuted: false,
    })
    expect(l.executed()).toBe(0)
  })
})
