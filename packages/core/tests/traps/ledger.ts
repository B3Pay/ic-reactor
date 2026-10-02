/**
 * The ledger every trap file calls, through the public surface a test of an
 * app has: `createTestClient` from `@ic-reactor/core/testing`, and the
 * `icrc1` module `candid-core-cli gen` wrote for `icrc1.did`.
 *
 * It is an ICRC-1 ledger that keeps balances, so a trap can say what a
 * hand-written integration gets wrong in the terms of money: a transfer that
 * was sent twice debits twice, a balance that was not read again hides a debit
 * that did happen, and a read made for one user shows another's.
 *
 * Not a test file, and not part of the package: the traps import it, and
 * nothing else does.
 */
import { principal, type Principal } from "@candid-core/schema"
import { vi } from "vitest"
import type { Canister, Client } from "../../src/index.js"
import { createTestClient } from "../../src/testing/index.js"
import * as icrc1 from "../fixtures/icrc1.js"

// The traps wait out real delays and run their tests side by side, and every
// call is signed and certified: on a machine that is busy with other test
// files a test can take many times what it takes alone. A timeout is for a
// call that never arrives, not for a slow one.
vi.setConfig({ testTimeout: 30_000 })

/** The canister id the traps run their ledger at. */
export const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/** What the ledger charges on top of every transfer. */
export const FEE = 10_000n

/**
 * The principals of the identities of seeds 1 and 2, the same in every run on
 * every machine (`auth.switchTo(2)` signs in as the second).
 */
export const ALICE = principal(
  "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
)
export const BOB = principal(
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
)

/** The anonymous principal: who calls while nobody is signed in. */
export const ANONYMOUS = principal("2vxsx-fae")

/** Somebody to pay. */
export const SHOP = principal("rrkah-fqaaa-aaaaa-aaaaq-cai")

type TestClient = ReturnType<typeof createTestClient>

/** The options of `createTestClient`. */
export type TestClientOptions = NonNullable<
  Parameters<typeof createTestClient>[0]
>

/** The transfer `amount` to `SHOP`, as the ledger's argument. */
export const transferArg = (
  amount: bigint,
  to: Principal = SHOP
): icrc1.TransferArg => ({
  to: { owner: to, subaccount: null },
  amount,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
})

/** What a ledger test is handed. */
export interface Ledger extends TestClient {
  /** The ledger, called as whoever is signed in. */
  readonly ledger: Canister<icrc1.Actor>
  /** Everyone's balance, by principal text. A test may set one. */
  readonly balances: Map<string, bigint>
  /** How many transfers changed the ledger's books: what really happened. */
  readonly executed: () => number
  /** Every canister request (a query or a call) the fake received, in order. */
  readonly sent: () => TestClient["requests"][number][]
  /** The calls (updates) the fake received. */
  readonly calls: () => TestClient["requests"][number][]
  /**
   * Replaces what the ledger does with a transfer. `apply()` books it (debits
   * the caller, credits the payee, counts it in `executed()`) and returns the
   * reply a ledger gives; what the function returns, or throws through
   * `reject()`, is what the call ends with.
   */
  onTransfer(handler: (apply: () => icrc1.TransferResult) => unknown): void
  /**
   * Runs `handler` before every `icrc1_balance_of` answers, which may fail the
   * read by calling `reject()` or throwing.
   */
  beforeRead(handler: () => void): void
  /**
   * Holds every `icrc1_balance_of` read sent as `caller` until the returned
   * function is called: a slow read, in flight while the user changes.
   */
  hold(caller: string): () => void
}

const made: Client[] = []

/**
 * Disposes every client the traps made. Call it from the file's `afterAll`:
 * the traps run their tests side by side to overlap their waits, so a client
 * must outlive the test that made it until the whole file is done.
 */
export const disposeAll = (): void => {
  for (const client of made.splice(0)) client.dispose()
}

/** Has {@link disposeAll} dispose `client` too, and returns it. */
export const track = (client: Client): Client => {
  made.push(client)
  return client
}

/**
 * A ledger on a test client. The client signs in as the identity of seed 1
 * (`ALICE`) unless the options say otherwise, and every principal starts with
 * `balances` (by default: Alice has 1,000,000 and Bob 500,000).
 *
 * `icrc1_balance_of` answers for the account it is asked about, to anyone
 * (with `privateBalances`: to its owner only, and zero to everybody else), and
 * `icrc1_transfer` debits the caller the amount and the fee, or answers
 * `InsufficientFunds`.
 */
export function setupLedger(
  options: TestClientOptions & {
    balances?: Iterable<readonly [string, bigint]>
    privateBalances?: boolean
  } = {}
): Ledger {
  const { balances: initial, privateBalances, ...clientOptions } = options
  const test = createTestClient(clientOptions)
  track(test.client)
  const balances = new Map<string, bigint>(
    initial ?? [
      [ALICE, 1_000_000n],
      [BOB, 500_000n],
    ]
  )
  let executed = 0
  let blocks = 0n
  const holds = new Map<string, Promise<void>>()
  let transfer: (apply: () => icrc1.TransferResult) => unknown = (apply) =>
    apply()
  let beforeRead = (): void => undefined

  test.mock<icrc1.Actor>(icrc1.actor, LEDGER, {
    icrc1_fee: () => FEE,
    icrc1_balance_of: async ({ owner }, { caller }) => {
      beforeRead()
      await holds.get(caller)
      // A private ledger tells an account's balance to its owner and shows
      // everybody else zero, so what a read answers depends on who sent it.
      return privateBalances === true && owner !== caller
        ? 0n
        : (balances.get(owner) ?? 0n)
    },
    icrc1_transfer: (arg, { caller }) =>
      transfer((): icrc1.TransferResult => {
        const debit = arg.amount + FEE
        const balance = balances.get(caller) ?? 0n
        if (balance < debit) {
          return {
            tag: "Err",
            value: { tag: "InsufficientFunds", value: { balance } },
          }
        }
        balances.set(caller, balance - debit)
        balances.set(
          arg.to.owner,
          (balances.get(arg.to.owner) ?? 0n) + arg.amount
        )
        executed += 1
        blocks += 1n
        return { tag: "Ok", value: blocks }
      }) as icrc1.TransferResult,
  })

  const requests = (): TestClient["requests"][number][] => [...test.requests]
  return {
    ...test,
    ledger: test.client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER }),
    balances,
    executed: () => executed,
    sent: () =>
      requests().filter(
        (request) => request.endpoint === "query" || request.endpoint === "call"
      ),
    calls: () => requests().filter((request) => request.endpoint === "call"),
    onTransfer(handler) {
      transfer = handler
    },
    beforeRead(handler) {
      beforeRead = handler
    },
    hold(caller) {
      let release!: () => void
      holds.set(
        caller,
        new Promise<void>((resolve) => {
          release = () => {
            holds.delete(caller)
            resolve()
          }
        })
      )
      return release
    },
  }
}

/**
 * Retries `check` until it stops throwing, polling every 5 ms for up to five
 * seconds: long enough for a loaded machine, short enough to fail on a call
 * that was never going to arrive.
 */
export const eventually = <T>(check: () => T): Promise<T> =>
  vi.waitFor(check, { timeout: 5_000, interval: 5 })

/** Waits `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Waits until every re-send an update could get has been sent (300 ms and then
 * 600 ms after a failure that allows one), with a margin for signing and
 * certifying them: whatever the client was ever going to send again is in the
 * fake's log after this.
 */
export const pastResendDelays = (): Promise<void> => sleep(300 + 600 + 250)

/** What a promise rejects with; fails the test when it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("expected the call to reject, and it resolved")
}
