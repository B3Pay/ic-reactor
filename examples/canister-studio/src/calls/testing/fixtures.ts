// Test-only: a typed interface built straight from a registry entry, and an
// ICRC-1 ledger and a ckBTC minter mocked at their real mainnet ids on
// `createTestClient()`'s in-memory replica. Nothing here reaches the app.
import {
  serviceMethods,
  type AnySchema,
  type Principal,
} from "@candid-core/schema"
import { createTestClient } from "@ic-reactor/core/testing"
import type { Actor as Minter } from "../../canisters/ckbtc_minter.ts"
import type { Actor as Ledger, TransferArg } from "../../canisters/icrc1.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { registryEntry, type RegistryEntry } from "../../lib/registry.ts"

export const CKBTC_LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
export const CKBTC_MINTER = "mqygn-kiaaa-aaaar-qaadq-cai"
export const ICP_LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

/** The principals of the test identities of seeds 1 and 2. */
export const SEED_1 =
  "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
export const SEED_2 =
  "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"

export const FEE = 10n

function entry(id: string): RegistryEntry {
  const found = registryEntry(id)
  if (found === undefined) throw new Error(`no registry entry for ${id}`)
  return found
}

/** What `interfaceFromPayload` gives for a typed canister, built here without it. */
export function typedInterface(id: string): CanisterInterface {
  const registry = entry(id)
  const methods: MethodInfo[] = [...serviceMethods(registry.actor).values()]
    .map((m) => ({
      name: m.name,
      mode: m.mode,
      args: m.args,
      results: m.results,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const byName = new Map(methods.map((m) => [m.name, m]))
  return {
    canisterId: registry.id,
    name: registry.name,
    actor: registry.actor,
    methods,
    method: (name) => byName.get(name),
    source: { kind: "typed", module: registry.module },
    did: registry.did,
    omitted: [],
    registry,
  }
}

/**
 * A canister the registry does not know, as a pasted .did gives it: nothing
 * is known about how it behaves beyond its interface.
 */
export function runtimeInterface(
  id: string,
  actor: AnySchema
): CanisterInterface {
  const methods: MethodInfo[] = [...serviceMethods(actor).values()].map(
    (m) => ({ name: m.name, mode: m.mode, args: m.args, results: m.results })
  )
  const byName = new Map(methods.map((m) => [m.name, m]))
  return {
    canisterId: id,
    name: "Pasted canister",
    actor,
    methods,
    method: (name) => byName.get(name),
    source: { kind: "pasted", certified: false },
    didSha256: `test-${id}`,
    omitted: [],
  }
}

export function methodOf(iface: CanisterInterface, name: string): MethodInfo {
  const method = iface.method(name)
  if (method === undefined) throw new Error(`no method ${name}`)
  return method
}

export type TestClient = ReturnType<typeof createTestClient>

export interface TestLedger {
  readonly test: TestClient
  /** Every transfer argument the ledger ran (deduplicated ones excluded). */
  readonly transfers: TransferArg[]
  setBalance(owner: string, units: bigint): void
  balanceOf(owner: string): bigint
  /** How many canister requests named `method` (queries and calls). */
  callsOf(method: string): number
}

/**
 * A test client with `network: "ic"` (so keys are the production keys) over
 * an ICRC-1 ledger at ckBTC's id that deduplicates transfers on the whole
 * argument and the caller, as ICRC-1 says, when `created_at_time` is set.
 */
export function createTestLedger(
  options: { signedIn?: boolean } = {}
): TestLedger {
  const test = createTestClient({
    network: "ic",
    identity: 1,
    signedIn: options.signedIn ?? true,
  })
  const balances = new Map<string, bigint>()
  const seen = new Map<string, bigint>()
  const transfers: TransferArg[] = []
  let block = 0n
  const balanceOf = (owner: string) => balances.get(owner) ?? 0n
  const keyOf = (caller: Principal, arg: TransferArg) =>
    [
      caller,
      arg.to.owner,
      arg.amount,
      arg.fee ?? "-",
      arg.created_at_time,
    ].join("|")

  test.mock<Ledger>(entry(CKBTC_LEDGER).actor, CKBTC_LEDGER, {
    icrc1_name: () => "ckBTC",
    icrc1_symbol: () => "ckBTC",
    icrc1_decimals: () => 8,
    icrc1_fee: () => FEE,
    icrc1_total_supply: () => 21_000_000n,
    icrc1_metadata: () => [],
    icrc1_minting_account: () => null,
    icrc1_supported_standards: () => [],
    icrc1_balance_of: (account) => balanceOf(account.owner),
    icrc1_transfer: (arg, { caller }) => {
      const key = keyOf(caller, arg)
      const original = arg.created_at_time === null ? undefined : seen.get(key)
      if (original !== undefined) {
        return {
          tag: "Err",
          value: { tag: "Duplicate", value: { duplicate_of: original } },
        }
      }
      const balance = balanceOf(caller)
      if (balance < arg.amount + FEE) {
        return {
          tag: "Err",
          value: { tag: "InsufficientFunds", value: { balance } },
        }
      }
      balances.set(caller, balance - arg.amount - FEE)
      balances.set(arg.to.owner, balanceOf(arg.to.owner) + arg.amount)
      transfers.push(arg)
      const index = block++
      if (arg.created_at_time !== null) seen.set(key, index)
      return { tag: "Ok", value: index }
    },
  })
  test.mock<Minter>(entry(CKBTC_MINTER).actor, CKBTC_MINTER, {
    get_btc_address: (arg, { caller }) => `bc1q-${arg.owner ?? caller}`,
  })

  return {
    test,
    transfers,
    setBalance: (owner, units) => balances.set(owner, units),
    balanceOf,
    callsOf: (method) =>
      test.requests.filter(
        (r) =>
          (r.endpoint === "call" || r.endpoint === "query") &&
          r.methodName === method
      ).length,
  }
}

/** A transfer argument, `created_at_time` left empty. */
export function transferArg(to: Principal, amount: bigint): TransferArg {
  return {
    to: { owner: to, subaccount: null },
    amount,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  }
}
