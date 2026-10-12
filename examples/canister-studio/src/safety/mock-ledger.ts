import {
  c,
  serviceMethods,
  type Principal,
  type Schema,
  type WithMode,
} from "@candid-core/schema"
import type { Canister, Client } from "@ic-reactor/core"
import type { createTestClient, TestHandlers } from "@ic-reactor/core/testing"
import {
  Account,
  actor as icrc1Actor,
  type Account as AccountValue,
  type Actor as Icrc1Actor,
  type TransferArg,
  type TransferResult,
} from "../canisters/icrc1.ts"
import type { MethodInfo } from "../interface/types.ts"
import { toHex } from "../lib/hex.ts"
import type { TokenUnits } from "../lib/format.ts"

/**
 * The mocks stand at the ckBTC ledger's and index's real ids, so the request
 * log and the query keys read like production ones. Nothing is sent to them:
 * the lab's client talks to an in-memory replica only.
 */
export const LAB_LEDGER_ID = "mxzaz-hqaaa-aaaar-qaada-cai"
export const LAB_INDEX_ID = "n5wcd-faaaa-aaaar-qaaea-cai"

export const LAB_FEE = 10n
export const LAB_UNITS: TokenUnits = { decimals: 8, symbol: "ckBTC" }

/** What one createTestClient() call returns: client, auth, mock, faults, log. */
export type TestKit = ReturnType<typeof createTestClient>
export type TestRequest = TestKit["requests"][number]

/**
 * A service with one composite query, standing in for an index canister that
 * asks the ledger on the caller's behalf. None of the generated modules has a
 * composite query, and scenario 10 needs one to show the certified refusal.
 */
export const labIndexActor: Schema<Principal> = c.service({
  balance_via_ledger: c.func([Account], [c.nat], "composite_query"),
})

export type LabIndexActor = {
  balance_via_ledger: ((account: AccountValue) => Promise<bigint>) &
    WithMode<"composite_query">
}

/** How the next transfer fails before it touches any balance. */
export type TransferFault =
  | { readonly kind: "trap"; readonly message: string }
  | { readonly kind: "reject"; readonly code: 3 | 4; readonly message: string }

/**
 * An in-memory ICRC-1 ledger: balances per account, a fixed fee, and the
 * standard's deduplication (a transfer with `created_at_time` set runs at most
 * once per sender and content; the second time it answers `Duplicate`).
 */
export interface MockLedger {
  readonly handlers: TestHandlers<Icrc1Actor>
  readonly indexHandlers: TestHandlers<LabIndexActor>
  balanceOf(owner: string): bigint
  fund(owner: string, amount: bigint): void
  /** Arms a failure for the next `icrc1_transfer` (consumed by it). */
  failNextTransfer(fault: TransferFault): void
  /** How many transfers changed balances: what "executed" means here. */
  readonly executed: number
}

const DEFAULT_SUBACCOUNT = "default"

const subaccountKey = (sub: Uint8Array | null): string =>
  sub === null || sub.every((b) => b === 0) ? DEFAULT_SUBACCOUNT : toHex(sub)

const accountKey = (owner: string, sub: Uint8Array | null): string =>
  `${owner}.${subaccountKey(sub)}`

const bytesKey = (bytes: Uint8Array | null): string =>
  bytes === null ? "-" : toHex(bytes)

// The ledger deduplicates on the whole transaction from one sender, so two
// different transfers that happen to share a timestamp both run.
const dedupeKey = (caller: string, arg: TransferArg): string =>
  [
    caller,
    subaccountKey(arg.from_subaccount),
    accountKey(arg.to.owner, arg.to.subaccount),
    arg.amount.toString(),
    arg.fee === null ? "-" : arg.fee.toString(),
    bytesKey(arg.memo),
    String(arg.created_at_time),
  ].join("|")

export function createMockLedger(reject: TestKit["reject"]): MockLedger {
  const balances = new Map<string, bigint>()
  const seen = new Map<string, bigint>()
  let nextBlock = 0n
  let executed = 0
  let fault: TransferFault | undefined

  const balanceOf = (owner: string, sub: Uint8Array | null = null): bigint =>
    balances.get(accountKey(owner, sub)) ?? 0n

  const transfer = (arg: TransferArg, caller: string): TransferResult => {
    const armed = fault
    fault = undefined
    if (armed?.kind === "trap") throw new Error(armed.message)
    if (armed?.kind === "reject") reject(armed.code, armed.message)

    if (arg.fee !== null && arg.fee !== LAB_FEE) {
      return {
        tag: "Err",
        value: { tag: "BadFee", value: { expected_fee: LAB_FEE } },
      }
    }
    const key =
      arg.created_at_time === null ? undefined : dedupeKey(caller, arg)
    const duplicateOf = key === undefined ? undefined : seen.get(key)
    if (duplicateOf !== undefined) {
      return {
        tag: "Err",
        value: { tag: "Duplicate", value: { duplicate_of: duplicateOf } },
      }
    }
    const from = accountKey(caller, arg.from_subaccount)
    const balance = balances.get(from) ?? 0n
    if (balance < arg.amount + LAB_FEE) {
      return {
        tag: "Err",
        value: { tag: "InsufficientFunds", value: { balance } },
      }
    }
    const to = accountKey(arg.to.owner, arg.to.subaccount)
    balances.set(from, balance - arg.amount - LAB_FEE)
    balances.set(to, (balances.get(to) ?? 0n) + arg.amount)
    const block = nextBlock++
    executed++
    if (key !== undefined) seen.set(key, block)
    return { tag: "Ok", value: block }
  }

  const handlers: TestHandlers<Icrc1Actor> = {
    icrc1_name: () => "ckBTC (Safety lab mock)",
    icrc1_symbol: () => LAB_UNITS.symbol,
    icrc1_decimals: () => LAB_UNITS.decimals,
    icrc1_fee: () => LAB_FEE,
    icrc1_total_supply: () =>
      [...balances.values()].reduce((sum, b) => sum + b, 0n),
    icrc1_minting_account: () => null,
    icrc1_metadata: () => [
      ["icrc1:symbol", { tag: "Text", value: LAB_UNITS.symbol }],
      ["icrc1:decimals", { tag: "Nat", value: BigInt(LAB_UNITS.decimals) }],
      ["icrc1:fee", { tag: "Nat", value: LAB_FEE }],
    ],
    icrc1_supported_standards: () => [
      { name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" },
    ],
    icrc1_balance_of: (account) => balanceOf(account.owner, account.subaccount),
    icrc1_transfer: (arg, { caller }) => transfer(arg, caller),
  }

  const indexHandlers: TestHandlers<LabIndexActor> = {
    balance_via_ledger: (account) =>
      balanceOf(account.owner, account.subaccount),
  }

  return {
    handlers,
    indexHandlers,
    balanceOf: (owner) => balanceOf(owner),
    fund(owner, amount) {
      const key = accountKey(owner, null)
      balances.set(key, (balances.get(key) ?? 0n) + amount)
    },
    failNextTransfer(next) {
      fault = next
    },
    get executed() {
      return executed
    },
  }
}

/** One scenario's world: a fresh test client with the mocks installed. */
export interface Lab {
  readonly kit: TestKit
  readonly client: Client
  readonly ledger: Canister<Icrc1Actor>
  readonly index: Canister<LabIndexActor>
  readonly mock: MockLedger
}

export interface LabOptions {
  /** Start signed in (as the identity of seed 1). Default true. */
  readonly signedIn?: boolean
  /** What the identity of seed 1 holds at the start, in base units. */
  readonly fund?: bigint
}

type TestingModule = typeof import("@ic-reactor/core/testing")

let runtime: Promise<TestingModule> | undefined

/**
 * Loads `@ic-reactor/core/testing` once. It is imported on first use only, so
 * it (and the fake replica's signing code) stays out of the page's main
 * bundle and loads when a visitor first presses Run. A failed load is not
 * kept, so the next Run tries again.
 */
export function loadLabRuntime(): Promise<TestingModule> {
  runtime ??= import("@ic-reactor/core/testing").catch((cause: unknown) => {
    runtime = undefined
    throw cause
  })
  return runtime
}

/**
 * A fresh lab: a new test client with the mocks installed, so every run of a
 * scenario starts from the same state and its request log holds only its
 * own requests.
 *
 * `network: "ic"` makes the key segment and host mainnet's, so the keys the
 * lab shows are the ones the app builds; the fake replica answers on that
 * host and certifies with its own root key, and no request leaves the page.
 */
export async function createLab(options: LabOptions = {}): Promise<Lab> {
  const { createTestClient } = await loadLabRuntime()
  const kit = createTestClient({
    network: "ic",
    signedIn: options.signedIn ?? true,
  })
  const mock = createMockLedger(kit.reject)
  kit.mock<Icrc1Actor>(icrc1Actor, LAB_LEDGER_ID, mock.handlers)
  kit.mock<LabIndexActor>(labIndexActor, LAB_INDEX_ID, mock.indexHandlers)
  if (options.fund !== undefined) {
    // The test auth knows who is signed in; funding asks the client nothing
    // and sends nothing.
    const signedIn = kit.auth.getPrincipal()?.toText()
    if (signedIn !== undefined) mock.fund(signedIn, options.fund)
  }
  const client = kit.client
  return {
    kit,
    client,
    ledger: client.canister<Icrc1Actor>(icrc1Actor, { id: LAB_LEDGER_ID }),
    index: client.canister<LabIndexActor>(labIndexActor, { id: LAB_INDEX_ID }),
    mock,
  }
}

const LAB_METHODS: ReadonlyMap<string, MethodInfo> = new Map(
  [...serviceMethods(icrc1Actor).values()].map((m) => [
    m.name,
    { name: m.name, mode: m.mode, args: m.args, results: m.results },
  ])
)

/** A method of the mock ledger, for the form and viewer components. */
export const labMethod = (name: string): MethodInfo | undefined =>
  LAB_METHODS.get(name)
