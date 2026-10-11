import type { AnySchema } from "@candid-core/schema"
import ckbtcMinterDid from "../../did/ckbtc_minter.did?raw"
import icpLedgerDid from "../../did/icp_ledger.did?raw"
import icrc1Did from "../../did/icrc1.did?raw"
import { actor as ckbtcMinterActor } from "../canisters/ckbtc_minter.ts"
import { actor as icpLedgerActor } from "../canisters/icp_ledger.ts"
import { actor as icrc1Actor } from "../canisters/icrc1.ts"

/**
 * A canister the app knows at build time: its interface is a committed .did,
 * generated into a typed module under src/canisters/, so it needs no live
 * metadata read and its methods have generated TypeScript types.
 */
export interface RegistryEntry {
  /** Canister id (principal text). */
  id: string
  /** URL-friendly name, unique in the registry. */
  slug: string
  name: string
  /** The token's symbol, for a ledger (a hint; the ledger's own reply wins). */
  symbol?: string
  /** The token's decimals, for a ledger (a hint; the ledger's own reply wins). */
  decimals?: number
  description: string
  kind: "icrc1-ledger" | "icp-ledger" | "ckbtc-minter"
  /** Which generated module types it: `src/canisters/<module>.ts`. */
  module: "icrc1" | "icp_ledger" | "ckbtc_minter"
  /** That module's `actor`: what `client.canister()` takes. */
  actor: AnySchema
  /** The committed .did text the module was generated from. */
  did: string
  /**
   * Update methods that change nothing and answer the same for the same
   * caller and arguments, so the app may offer them as reads through
   * `client.queryOptions(c, m, vars, { update: "idempotent" })`.
   */
  idempotentUpdates?: readonly string[]
  /** Shown on the home page with live stats. */
  featured?: boolean
}

export const REGISTRY: readonly RegistryEntry[] = [
  {
    id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    slug: "icp-ledger",
    name: "ICP ledger",
    symbol: "ICP",
    decimals: 8,
    description:
      "The ICP token's ledger: ICRC-1 and ICRC-2, plus its original account-identifier API.",
    kind: "icp-ledger",
    module: "icp_ledger",
    actor: icpLedgerActor,
    did: icpLedgerDid,
    featured: true,
  },
  {
    id: "mxzaz-hqaaa-aaaar-qaada-cai",
    slug: "ckbtc-ledger",
    name: "ckBTC ledger",
    symbol: "ckBTC",
    decimals: 8,
    description:
      "The ICRC-1 ledger of ckBTC, bitcoin on the Internet Computer.",
    kind: "icrc1-ledger",
    module: "icrc1",
    actor: icrc1Actor,
    did: icrc1Did,
    featured: true,
  },
  {
    id: "ss2fx-dyaaa-aaaar-qacoq-cai",
    slug: "cketh-ledger",
    name: "ckETH ledger",
    symbol: "ckETH",
    decimals: 18,
    description: "The ICRC-1 ledger of ckETH, ether on the Internet Computer.",
    kind: "icrc1-ledger",
    module: "icrc1",
    actor: icrc1Actor,
    did: icrc1Did,
    featured: true,
  },
  {
    id: "mqygn-kiaaa-aaaar-qaadq-cai",
    slug: "ckbtc-minter",
    name: "ckBTC minter",
    description:
      "Mints ckBTC for bitcoin deposits and sends bitcoin back for ckBTC.",
    kind: "ckbtc-minter",
    module: "ckbtc_minter",
    actor: ckbtcMinterActor,
    did: ckbtcMinterDid,
    // The deposit address is derived from the owner and subaccount: asking
    // twice gives the same address and changes nothing.
    idempotentUpdates: ["get_btc_address"],
    featured: true,
  },
]

const BY_ID: ReadonlyMap<string, RegistryEntry> = new Map(
  REGISTRY.map((entry) => [entry.id, entry])
)

/** The registry entry of a canister id, or `undefined` for any other canister. */
export function registryEntry(id: string): RegistryEntry | undefined {
  return BY_ID.get(id)
}

/**
 * Mainnet canisters worth opening, each read live: their interfaces were
 * read from mainnet and compiled without a diagnostic on 2026-10-12. All but
 * the last publish certified `candid:service` metadata.
 */
export const CURATED: readonly { id: string; name: string; note: string }[] = [
  {
    id: "rrkah-fqaaa-aaaaa-aaaaq-cai",
    name: "NNS governance",
    note: "Neurons and proposals: 33 methods over a 50 KB interface.",
  },
  {
    id: "rdmx6-jaaaa-aaaaa-aaadq-cai",
    name: "Internet Identity",
    note: "The largest public interface here: 113 methods, 100 KB of Candid.",
  },
  {
    id: "um5iw-rqaaa-aaaaq-qaaba-cai",
    name: "Cycles ledger",
    note: "An ICRC-1 and ICRC-2 ledger of cycles that also creates canisters.",
  },
  {
    id: "rkp4c-7iaaa-aaaaa-aaaca-cai",
    name: "Cycles minting canister",
    note: "Turns ICP into cycles; reads the ICP/XDR conversion rate.",
  },
  {
    id: "qhbym-qaaaa-aaaaa-aaafq-cai",
    name: "ICP index",
    note: "The ICP ledger's transactions by account: queries only.",
  },
  {
    id: "qjdve-lqaaa-aaaaa-aaaeq-cai",
    name: "ICP ledger archive",
    note: "Old ICP ledger blocks behind two queries.",
  },
  {
    id: "rwlgt-iiaaa-aaaaa-aaaaa-cai",
    name: "NNS registry",
    note: "Subnets, nodes and their records: 57 methods, mostly updates.",
  },
  {
    id: "r7inp-6aaaa-aaaaa-aaabq-cai",
    name: "NNS root",
    note: "The controller of the NNS canisters.",
  },
  {
    id: "qaa6y-5yaaa-aaaaa-aaafa-cai",
    name: "SNS wasm",
    note: "Deploys SNS DAOs and lists the deployed ones.",
  },
  {
    id: "3r4gx-wqaaa-aaaaq-aaaia-cai",
    name: "SNS aggregator",
    note: "A small, query-heavy cache of SNS data.",
  },
  {
    id: "sv3dd-oaaaa-aaaar-qacoa-cai",
    name: "ckETH minter",
    note: "Mints ckETH for ether deposits and withdraws ether for ckETH.",
  },
  {
    id: "7hfb6-caaaa-aaaar-qadga-cai",
    name: "EVM RPC",
    note: "Ethereum JSON-RPC for canisters.",
  },
  {
    id: "ghsi2-tqaaa-aaaan-aaaca-cai",
    name: "Bitcoin canister",
    note: "Bitcoin UTXOs, balances and fee percentiles.",
  },
  {
    id: "uf6dk-hyaaa-aaaaq-qaaaq-cai",
    name: "Exchange rate canister",
    note: "A single method: an update that charges cycles for a rate.",
  },
  {
    id: "2jvtu-yqaaa-aaaaq-aaama-cai",
    name: "OpenChat SNS governance",
    note: "Has a composite query, which has no certified path.",
  },
  {
    id: "mwrha-maaaa-aaaab-qabqq-cai",
    name: "Motoko playground",
    note: "Has a oneway method: sent, with no reply and no outcome.",
  },
  {
    id: "lj532-6iaaa-aaaah-qcc7a-cai",
    name: "CAP router",
    note: "No metadata: its interface comes from an uncertified query, and is labelled so.",
  },
]
