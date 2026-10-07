// The Sandbox tab's world: a real client from `createTestClient()`, over the
// in-memory replica of `@ic-reactor/core/testing`, with a mocked ICRC-1 ledger
// and a mocked ckBTC minter on it. It runs in the page (nothing leaves it) and
// in the Node tests (sandbox.test.ts), which is why it is plain TypeScript
// with no React.
import { principal, type Principal } from "@candid-core/schema"
import type { Canister, Client } from "@ic-reactor/core"
import { createTestClient, type TestHandlers } from "@ic-reactor/core/testing"
import {
  actor as minterActor,
  type Actor as MinterActor,
} from "./canisters/ckbtc_minter.ts"
import {
  actor,
  type Account,
  type Actor,
  type TransferArg,
  type TransferError,
  type TransferResult,
} from "./canisters/icrc1.ts"
import { ICP_LEDGER, ledgerOn } from "./ledger.ts"
import { CKBTC_MINTER, minterOn, type Minter } from "./minter.ts"

/** The mocked ledger answers at the ICP ledger's id: the code is the same. */
export const SANDBOX_LEDGER = ICP_LEDGER
export const DECIMALS = 8
/** 0.0001 ICP, the real ledger's fee. Fees are burned, as on the ICP ledger. */
export const FEE = 10_000n

/**
 * The principals of the test identities of seeds 1 and 2. A seed stands for
 * the same identity in every run, so these are constants (a test pins them).
 */
export const SEED_1 = principal(
  "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
)
export const SEED_2 = principal(
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"
)

/** The anonymous principal, as text. */
export const ANONYMOUS = principal("2vxsx-fae")

/** Who mints: NNS governance, as on mainnet. A transfer to it is a burn. */
export const MINTING_ACCOUNT: Account = {
  owner: principal("rrkah-fqaaa-aaaaa-aaaaq-cai"),
  subaccount: null,
}

/** What the sandbox starts with: 10 ICP for seed 1 and 2.5 ICP for seed 2. */
export const START_BALANCES: ReadonlyArray<readonly [Principal, bigint]> = [
  [SEED_1, 1_000_000_000n],
  [SEED_2, 250_000_000n],
]

/**
 * A failure to arm for the next transfer, to see what the client makes of it:
 *
 * - `reject-4`: the canister rejects the call (reject code 4). The client
 *   cannot know whether it changed state first, so `mayHaveExecuted` is true;
 *   this mock rejects before it debits anything, and the re-read shows that.
 * - `lost-reply`: the transfer runs but its reply is lost on the way back:
 *   `outcome_unknown`, may have executed, and the re-read shows the debit.
 * - `http-429`: a boundary node throttles the first send (status 429). That
 *   proves it never got in, so the client sends it again once, by itself.
 * - `reject-2`: the system rejects the first send as transient (reject code
 *   2). Same proof, same single re-send.
 * - `http-429-x3`: throttled three times. The client re-sends at most twice,
 *   then gives up with `not_delivered`: certainly not executed.
 */
export type Fault =
  "reject-4" | "lost-reply" | "http-429" | "reject-2" | "http-429-x3"

type TestClient = ReturnType<typeof createTestClient>

/** A sandbox: the test client's parts, the ledger on it, and the fault switch. */
export interface Sandbox {
  readonly client: Client
  /** The sign-in the client calls as: `signIn(1)`, `switchTo(2)`, `signOut()`. */
  readonly auth: TestClient["auth"]
  /** Every request the in-memory replica received, in order. */
  readonly requests: TestClient["requests"]
  readonly ledger: Canister<Actor>
  /**
   * A mocked ckBTC minter. Its `get_btc_address` is an update method that
   * gives the same address however often it runs, so the page reads it with
   * `client.queryOptions(minter, "get_btc_address", arg, { update:
   * "idempotent" })`.
   */
  readonly minter: Minter
  /** Makes the next transfer meet `fault`. */
  arm(fault: Fault): void
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const hex = (bytes: Uint8Array | null) =>
  bytes === null
    ? ""
    : Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** One key per ICRC-1 account; no subaccount and 32 zero bytes are the same. */
const accountKey = ({ owner, subaccount }: Account) =>
  subaccount === null || subaccount.every((b) => b === 0)
    ? owner
    : `${owner}.${hex(subaccount)}`

/**
 * A made-up deposit address for an account: the same text for the same
 * account, every time (FNV-1a over the account key). The `-sandbox-` in it
 * keeps anyone from mistaking it for a Bitcoin address.
 */
export function sandboxBtcAddress(account: Account): string {
  let hash = 0xcbf29ce484222325n
  let text = ""
  for (const round of [1, 2]) {
    for (const char of `${round}:${accountKey(account)}`) {
      hash ^= BigInt(char.charCodeAt(0))
      hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
    }
    text += hash.toString(16).padStart(16, "0")
  }
  return `bc1q-sandbox-${text}`
}

/** ICRC-1's deduplication window, and the clock drift it allows, in ns. */
const TX_WINDOW = 24n * 60n * 60n * 1_000_000_000n
const PERMITTED_DRIFT = 2n * 60n * 1_000_000_000n

/**
 * Creates a sandbox: a test client signed in as seed 1, and a mocked ICRC-1
 * ledger that keeps a balance per account, charges and burns the fee, and
 * answers `icrc1_transfer` with the standard's `Err` arms (`BadFee`,
 * `InsufficientFunds`, `TooOld`, `CreatedInFuture`, `Duplicate`, `BadBurn`),
 * and a mocked ckBTC minter whose `get_btc_address` gives each account a
 * made-up address of its own ({@link sandboxBtcAddress}).
 *
 * @param options.latencyMs - How long the ledger takes over a balance read or
 * a transfer, and the minter over an address, so that a page can show the
 * phases. Tests leave it at 0.
 */
export function createSandbox(options: { latencyMs?: number } = {}): Sandbox {
  const latencyMs = options.latencyMs ?? 0
  const test = createTestClient({ identity: 1 })
  const { client, auth, mock, reject } = test

  const balances = new Map<string, bigint>(
    START_BALANCES.map(([owner, amount]) => [
      accountKey({ owner, subaccount: null }),
      amount,
    ])
  )
  const deduplication = new Map<string, bigint>()
  let nextBlock = 0n
  let armedReject: 2 | 4 | undefined

  const balanceOf = (account: Account) =>
    balances.get(accountKey(account)) ?? 0n
  const pause = () => (latencyMs > 0 ? sleep(latencyMs) : undefined)
  const refuse = (value: TransferError): TransferResult => ({
    tag: "Err",
    value,
  })

  function transfer(arg: TransferArg, caller: Principal): TransferResult {
    const from: Account = { owner: caller, subaccount: arg.from_subaccount }
    const now = BigInt(Date.now()) * 1_000_000n
    // As ICRC-1 deduplicates: on the whole transaction, so two arguments that
    // differ in any field (the memo too, and no memo from an empty one) are
    // two transfers.
    const txKey = [
      accountKey(from),
      accountKey(arg.to),
      arg.amount,
      arg.fee ?? "",
      arg.memo === null ? "-" : hex(arg.memo),
      arg.created_at_time,
    ].join("|")
    if (arg.created_at_time !== null) {
      if (arg.created_at_time < now - TX_WINDOW - PERMITTED_DRIFT) {
        return refuse({ tag: "TooOld" })
      }
      if (arg.created_at_time > now + PERMITTED_DRIFT) {
        return refuse({ tag: "CreatedInFuture", value: { ledger_time: now } })
      }
      const original = deduplication.get(txKey)
      if (original !== undefined) {
        return refuse({ tag: "Duplicate", value: { duplicate_of: original } })
      }
    }
    const burn = accountKey(arg.to) === accountKey(MINTING_ACCOUNT)
    const fee = burn ? 0n : FEE
    if (arg.fee !== null && arg.fee !== fee) {
      return refuse({ tag: "BadFee", value: { expected_fee: fee } })
    }
    if (burn && arg.amount < FEE) {
      return refuse({ tag: "BadBurn", value: { min_burn_amount: FEE } })
    }
    const balance = balanceOf(from)
    if (balance < arg.amount + fee) {
      return refuse({ tag: "InsufficientFunds", value: { balance } })
    }
    balances.set(accountKey(from), balance - arg.amount - fee)
    if (!burn) balances.set(accountKey(arg.to), balanceOf(arg.to) + arg.amount)
    const block = nextBlock++
    if (arg.created_at_time !== null) deduplication.set(txKey, block)
    return { tag: "Ok", value: block }
  }

  const handlers: TestHandlers<Actor> = {
    icrc1_name: () => "Internet Computer (sandbox)",
    icrc1_symbol: () => "ICP",
    icrc1_decimals: () => DECIMALS,
    icrc1_fee: () => FEE,
    icrc1_total_supply: () =>
      [...balances.values()].reduce((sum, amount) => sum + amount, 0n),
    icrc1_minting_account: () => MINTING_ACCOUNT,
    icrc1_metadata: () => [
      ["icrc1:name", { tag: "Text", value: "Internet Computer (sandbox)" }],
      ["icrc1:symbol", { tag: "Text", value: "ICP" }],
      ["icrc1:decimals", { tag: "Nat", value: BigInt(DECIMALS) }],
      ["icrc1:fee", { tag: "Nat", value: FEE }],
    ],
    icrc1_supported_standards: () => [
      { name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" },
    ],
    icrc1_balance_of: async (account) => {
      await pause()
      return balanceOf(account)
    },
    icrc1_transfer: async (arg, { caller }) => {
      await pause()
      const code = armedReject
      armedReject = undefined
      if (code !== undefined) {
        reject(code, `the sandbox ledger rejected the transfer (code ${code})`)
      }
      return transfer(arg, caller)
    },
  }
  mock<Actor>(actor, SANDBOX_LEDGER, handlers)

  // As the real minter: a null owner is the caller, and the anonymous
  // principal has no deposit address (the call traps).
  const minterHandlers: TestHandlers<MinterActor> = {
    get_btc_address: async ({ owner, subaccount }, { caller }) => {
      await pause()
      const resolved = owner ?? caller
      if (resolved === ANONYMOUS) {
        throw new Error("the owner must be non-anonymous")
      }
      return sandboxBtcAddress({ owner: resolved, subaccount })
    },
  }
  mock<MinterActor>(minterActor, CKBTC_MINTER, minterHandlers)

  return {
    client,
    auth,
    get requests() {
      return test.requests
    },
    ledger: ledgerOn(client, SANDBOX_LEDGER),
    minter: minterOn(client),
    arm(fault) {
      if (fault === "reject-4") armedReject = 4
      else if (fault === "reject-2") armedReject = 2
      else if (fault === "lost-reply") test.dropNextReply()
      else {
        // Aimed at the transfer, so a balance read the page makes meanwhile
        // is answered.
        test.refuseNext(429, {
          method: "icrc1_transfer",
          canister: SANDBOX_LEDGER,
          times: fault === "http-429" ? 1 : 3,
        })
      }
    },
  }
}
