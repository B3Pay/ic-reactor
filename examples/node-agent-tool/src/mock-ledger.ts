// An ICRC-1 ledger written as plain functions (`TestHandlers<Actor>`), for the
// in-memory replica of `createTestClient()` from @ic-reactor/core/testing. The
// `demo` command and the tests run the CLI against it: it keeps a balance per
// account, takes the fee, deduplicates by `created_at_time`, and answers
// `icrc1_transfer` with the standard's `Err` arms. Nothing here is ic-reactor
// API; the client that calls it is the real one.
import type { Principal } from "@candid-core/schema"
import type { createTestClient, TestHandlers } from "@ic-reactor/core/testing"
import {
  actor,
  type Account,
  type Actor,
  type TransferArg,
  type TransferError,
  type TransferResult,
} from "./canisters/icrc1.ts"
import { toHex } from "./input.ts"
import { DEDUP_WINDOW_NS } from "./commands/transfer.ts"

type TestClient = ReturnType<typeof createTestClient>

/** How far a `created_at_time` may be ahead of the ledger's clock: 2 minutes. */
const PERMITTED_DRIFT_NS = 2n * 60n * 1_000_000_000n

/**
 * The reads `transfer` makes before its call, in parallel: decimals, symbol,
 * fee and the sender's balance (src/commands/transfer.ts, step 2).
 */
const READS_BEFORE_THE_CALL = 4

export interface MockLedgerOptions {
  /** The canister id it answers at. */
  readonly id: string
  /** What each principal's default account holds at first, in base units. */
  readonly balances?: ReadonlyArray<readonly [Principal, bigint]>
  readonly name?: string
  readonly symbol?: string
  readonly decimals?: number
  readonly fee?: bigint
  /** The ledger's clock, in nanoseconds since the epoch. */
  readonly now?: () => bigint
}

export interface MockLedger {
  readonly id: string
  readonly decimals: number
  readonly fee: bigint
  /**
   * Runs the ledger on a test client's replica. Its accounts live here, not
   * on the replica, so a new client (one per run of the CLI) sees the same
   * ledger. `overrides` replace some of its methods.
   */
  mountOn(test: TestClient, overrides?: TestHandlers<Actor>): void
  /** What an account holds, in base units. */
  balanceOf(account: Account): bigint
  /** Adds to an account, as a transfer from elsewhere would. */
  credit(account: Account, units: bigint): void
  /**
   * Makes the next transfer reject with `code` before it changes anything:
   * `4` or `5` from the canister, `3` as from the system before it ran.
   */
  rejectNextTransfer(code: 3 | 4 | 5): void
  /**
   * Makes the next transfer answer `Err(err)` and move nothing, before the
   * ledger looks for a duplicate, as a real ledger does when it is paused
   * (`TemporarilyUnavailable`) or its fee has changed (`BadFee`).
   */
  answerNextTransfer(err: TransferError): void
  /**
   * Has the replica answer the next transfer call with HTTP 429, `times`
   * times in a row, as a boundary node that throttles.
   *
   * A workaround, not a pattern: `test.refuseNext(429)` refuses the next
   * request of any kind, a read as much as a call, and `transfer` reads four
   * times before it calls. So the refusal is armed once
   * `READS_BEFORE_THE_CALL` reads have been answered, when every read
   * has passed the replica's refusal check. (Arming it on the last read sent
   * would race the other three, which run in parallel.) If `transfer` ever
   * reads more or less, a read is refused instead of the call, and the demo
   * and the tests that throttle fail on the request log.
   */
  throttleNextTransfer(times?: number): void
  /** Every transfer argument the ledger was sent, with the caller the replica verified. */
  readonly received: ReadonlyArray<{
    readonly arg: TransferArg
    readonly caller: Principal
  }>
}

/** One key per account; no subaccount and 32 zero bytes are the same account. */
const keyOf = ({ owner, subaccount }: Account): string =>
  subaccount === null || subaccount.every((byte) => byte === 0)
    ? owner
    : `${owner}.${toHex(subaccount)}`

export function createMockLedger(options: MockLedgerOptions): MockLedger {
  const {
    id,
    name = "Internet Computer (mock)",
    symbol = "ICP",
    decimals = 8,
    fee = 10_000n,
    now = () => BigInt(Date.now()) * 1_000_000n,
  } = options
  const accounts = new Map<string, bigint>(
    (options.balances ?? []).map(([owner, units]) => [
      keyOf({ owner, subaccount: null }),
      units,
    ])
  )
  const seen = new Map<string, bigint>()
  const received: { arg: TransferArg; caller: Principal }[] = []
  let blocks = 0n
  let rejectNext: 3 | 4 | 5 | undefined
  let answerNext: TransferError | undefined
  let readsBeforeThrottle: number | undefined
  let throttles = 1

  const balanceOf = (account: Account) => accounts.get(keyOf(account)) ?? 0n
  const refuse = (value: TransferError): TransferResult => ({
    tag: "Err",
    value,
  })

  function transfer(arg: TransferArg, caller: Principal): TransferResult {
    const from: Account = { owner: caller, subaccount: arg.from_subaccount }
    const time = now()
    // The same sender and the same argument is the same transfer.
    const txKey = [
      keyOf(from),
      keyOf(arg.to),
      arg.amount,
      arg.fee ?? "default",
      arg.memo === null ? "" : toHex(arg.memo),
      arg.created_at_time,
    ].join("|")
    if (arg.created_at_time !== null) {
      if (arg.created_at_time < time - DEDUP_WINDOW_NS - PERMITTED_DRIFT_NS) {
        return refuse({ tag: "TooOld" })
      }
      if (arg.created_at_time > time + PERMITTED_DRIFT_NS) {
        return refuse({ tag: "CreatedInFuture", value: { ledger_time: time } })
      }
      const original = seen.get(txKey)
      if (original !== undefined) {
        return refuse({ tag: "Duplicate", value: { duplicate_of: original } })
      }
    }
    if (arg.fee !== null && arg.fee !== fee) {
      return refuse({ tag: "BadFee", value: { expected_fee: fee } })
    }
    const held = balanceOf(from)
    if (held < arg.amount + fee) {
      return refuse({ tag: "InsufficientFunds", value: { balance: held } })
    }
    accounts.set(keyOf(from), held - arg.amount - fee)
    accounts.set(keyOf(arg.to), balanceOf(arg.to) + arg.amount)
    const block = blocks++
    if (arg.created_at_time !== null) seen.set(txKey, block)
    return { tag: "Ok", value: block }
  }

  const handlersFor = (test: TestClient): TestHandlers<Actor> => {
    /** Answers a read, and arms a throttle once enough reads were answered. */
    const read = <T>(value: T): T => {
      if (readsBeforeThrottle !== undefined && --readsBeforeThrottle === 0) {
        readsBeforeThrottle = undefined
        test.refuseNext(429, throttles)
      }
      return value
    }
    return {
      icrc1_name: () => read(name),
      icrc1_symbol: () => read(symbol),
      icrc1_decimals: () => read(decimals),
      icrc1_fee: () => read(fee),
      icrc1_total_supply: () =>
        read([...accounts.values()].reduce((sum, units) => sum + units, 0n)),
      icrc1_minting_account: () => read(null),
      icrc1_metadata: () =>
        read([
          ["icrc1:name", { tag: "Text", value: name }],
          ["icrc1:symbol", { tag: "Text", value: symbol }],
          ["icrc1:decimals", { tag: "Nat", value: BigInt(decimals) }],
          ["icrc1:fee", { tag: "Nat", value: fee }],
        ]),
      icrc1_supported_standards: () =>
        read([{ name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" }]),
      icrc1_balance_of: (account) => read(balanceOf(account)),
      icrc1_transfer: (arg, { caller }) => {
        received.push({ arg, caller })
        const code = rejectNext
        rejectNext = undefined
        if (code !== undefined) {
          test.reject(
            code,
            `the mock ledger rejected this transfer (code ${code})`
          )
        }
        const err = answerNext
        answerNext = undefined
        return err === undefined ? transfer(arg, caller) : refuse(err)
      },
    }
  }

  return {
    id,
    decimals,
    fee,
    mountOn(test, overrides = {}) {
      test.mock<Actor>(actor, id, { ...handlersFor(test), ...overrides })
    },
    balanceOf,
    credit(account, units) {
      accounts.set(keyOf(account), balanceOf(account) + units)
    },
    rejectNextTransfer(code) {
      rejectNext = code
    },
    answerNextTransfer(err) {
      answerNext = err
    },
    throttleNextTransfer(times = 1) {
      readsBeforeThrottle = READS_BEFORE_THE_CALL
      throttles = times
    },
    received,
  }
}
