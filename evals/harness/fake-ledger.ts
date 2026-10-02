/**
 * A stateful ICRC-1 ledger for the hidden acceptance tests, run inside the
 * signing fake replica that `@ic-reactor/core/testing` ships (reused as
 * published in 3.13.0, not re-implemented here).
 *
 * The interface is `harness/icrc1.did` (the ICRC-1 reference ledger interface,
 * copied from `examples/tanstack-router/icrc1.did`), encoded and decoded with
 * the `@icp-sdk/bindgen` declarations in `harness/declarations/`. Nothing here
 * is condition-specific: every condition's solution talks to this ledger over
 * the IC HTTP interface, exactly as it would talk to a replica.
 */
import { createTestCanister, type FakeCanister } from "@ic-reactor/core/testing"
import { Principal } from "@icp-sdk/core/principal"
import {
  idlFactory,
  type Account,
  type _SERVICE,
} from "./declarations/icrc1.did.js"

export const LEDGER_FEE = 10_000n
/** The minting account's owner: a principal that comes back in a reply. */
export const MINTER = "rrkah-fqaaa-aaaaa-aaaaq-cai"
export const LEDGER_DECIMALS = 8

/**
 * The fake replica's own reject class. `@ic-reactor/core/testing` does not
 * export it, but a test canister throws it for a method it has no handler for,
 * and the fake replica answers an instance of exactly this class with the
 * reject code it carries (anything else it throws is a trap, code 5). Taking
 * the constructor from that error is how a handler can reject with codes 1-4.
 */
type RejectCtor = new (
  code: number,
  errorCode: string,
  message: string
) => Error
const FakeReplicaReject: RejectCtor = await (async () => {
  const probe = createTestCanister<_SERVICE>(idlFactory, {})
  try {
    await probe.update!("icrc1_transfer", new Uint8Array(), {
      caller: Principal.anonymous(),
    })
  } catch (error) {
    return (error as Error).constructor as RejectCtor
  }
  throw new Error(
    "fake-ledger: could not obtain the fake replica's reject class"
  )
})()

/** What each injected reject looks like, by IC reject code. */
const REJECTS: Record<number, { errorCode: string; message: string }> = {
  1: { errorCode: "IC0102", message: "fatal system error (injected)" },
  2: { errorCode: "IC0207", message: "the canister is frozen (injected)" },
  3: { errorCode: "IC0301", message: "no such destination (injected)" },
  4: {
    errorCode: "IC0406",
    message: "the ledger rejected the call (injected)",
  },
}

/** One transfer the ledger executed. */
export interface ExecutedTransfer {
  readonly from: string
  readonly to: string
  readonly amount: bigint
  readonly blockIndex: bigint
}

/** One icrc1_transfer call that reached the ledger, whatever came of it. */
export interface TransferAttempt {
  readonly caller: string
  readonly to: string
  readonly amount: bigint
}

export interface FakeLedger {
  readonly canister: FakeCanister
  readonly transfers: readonly ExecutedTransfer[]
  readonly attempts: readonly TransferAttempt[]
  setBalance(owner: string, amount: bigint): void
  balanceOf(owner: string): bigint
  /**
   * Reject every icrc1_transfer with this IC reject code: 1-4 through the
   * fake replica's reject class, 5 as a trap in the ledger's own code.
   * `null`: transfers run normally.
   */
  rejectTransfersWith: 1 | 2 | 3 | 4 | 5 | null
  /** Milliseconds icrc1_balance_of takes to answer for this owner. */
  balanceDelayMs: (owner: string) => number
}

const accountKey = (owner: Principal, sub: [] | [Uint8Array]): string => {
  const bytes = sub[0]
  const text = owner.toText()
  if (!bytes || bytes.every((byte) => byte === 0)) return text
  return `${text}:${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}
const keyOf = (account: Account) =>
  accountKey(account.owner, account.subaccount)

const delay = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : undefined

export function createFakeLedger(): FakeLedger {
  const balances = new Map<string, bigint>()
  const transfers: ExecutedTransfer[] = []
  const attempts: TransferAttempt[] = []
  let nextBlock = 1000n

  const ledger: FakeLedger = {
    canister: undefined as unknown as FakeCanister,
    transfers,
    attempts,
    rejectTransfersWith: null,
    balanceDelayMs: () => 0,
    setBalance(owner, amount) {
      balances.set(owner, amount)
    },
    balanceOf(owner) {
      return balances.get(owner) ?? 0n
    },
  }

  ;(ledger as { canister: FakeCanister }).canister =
    createTestCanister<_SERVICE>(idlFactory, {
      icrc1_name: () => "Eval Token",
      icrc1_symbol: () => "EVT",
      icrc1_decimals: () => LEDGER_DECIMALS,
      icrc1_fee: () => LEDGER_FEE,
      icrc1_metadata: () => [
        ["icrc1:name", { Text: "Eval Token" }],
        ["icrc1:symbol", { Text: "EVT" }],
        ["icrc1:decimals", { Nat: BigInt(LEDGER_DECIMALS) }],
        ["icrc1:fee", { Nat: LEDGER_FEE }],
      ],
      icrc1_total_supply: () =>
        [...balances.values()].reduce((sum, value) => sum + value, 0n),
      icrc1_minting_account: () => [
        { owner: Principal.fromText(MINTER), subaccount: [] },
      ],
      icrc1_supported_standards: () => [
        { name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" },
      ],
      icrc1_balance_of: async ([account]) => {
        const key = keyOf(account)
        await delay(ledger.balanceDelayMs(key))
        return balances.get(key) ?? 0n
      },
      icrc1_transfer: ([arg], { caller }: { caller: Principal }) => {
        const code = ledger.rejectTransfersWith
        if (code !== null && code !== 5) {
          const { errorCode, message } = REJECTS[code]
          throw new FakeReplicaReject(code, errorCode, message)
        }
        const from = accountKey(caller, arg.from_subaccount)
        const to = keyOf(arg.to)
        attempts.push({ caller: caller.toText(), to, amount: arg.amount })
        if (code === 5) {
          throw new Error("the ledger trapped (injected)")
        }
        const fee = arg.fee[0]
        if (fee !== undefined && fee !== LEDGER_FEE) {
          return { Err: { BadFee: { expected_fee: LEDGER_FEE } } }
        }
        const balance = balances.get(from) ?? 0n
        if (balance < arg.amount + LEDGER_FEE) {
          return { Err: { InsufficientFunds: { balance } } }
        }
        balances.set(from, balance - arg.amount - LEDGER_FEE)
        balances.set(to, (balances.get(to) ?? 0n) + arg.amount)
        const blockIndex = nextBlock++
        transfers.push({ from, to, amount: arg.amount, blockIndex })
        return { Ok: blockIndex }
      },
    })
  return ledger
}
