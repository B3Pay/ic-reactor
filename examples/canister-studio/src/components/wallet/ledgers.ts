import type { Client } from "@ic-reactor/core"
import {
  actor as minterActor,
  type Actor as MinterActor,
} from "../../canisters/ckbtc_minter.ts"
import {
  actor as icrc1Actor,
  type Actor as Icrc1Actor,
} from "../../canisters/icrc1.ts"
import { methodsOf } from "../../interface/load.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { REGISTRY, type RegistryEntry } from "../../lib/registry.ts"

// The wallet's ledgers, all typed by the icrc1 module: the ICP ledger is an
// ICRC-1 ledger too, so one generated `Actor` covers the three, with no
// cast anywhere.

export const WALLET_LEDGER_KEYS = ["icp", "ckbtc", "cketh"] as const
export type WalletLedgerKey = (typeof WALLET_LEDGER_KEYS)[number]

const SLUG: Readonly<Record<WalletLedgerKey, string>> = {
  icp: "icp-ledger",
  ckbtc: "ckbtc-ledger",
  cketh: "cketh-ledger",
}

function bySlug(slug: string): RegistryEntry {
  const entry = REGISTRY.find((candidate) => candidate.slug === slug)
  if (entry === undefined) throw new Error(`No registry entry ${slug}`)
  return entry
}

export const WALLET_LEDGERS: Readonly<Record<WalletLedgerKey, RegistryEntry>> =
  {
    icp: bySlug(SLUG.icp),
    ckbtc: bySlug(SLUG.ckbtc),
    cketh: bySlug(SLUG.cketh),
  }

export const CKBTC_MINTER: RegistryEntry = bySlug("ckbtc-minter")

/** A wallet ledger as a typed canister (`certified` gives the twin). */
export function ledgerCanister(client: Client, id: string, certified = false) {
  return client.canister<Icrc1Actor>(icrc1Actor, { id, certified })
}

/**
 * A ledger's public metadata reads, built the same way by the wallet's
 * loader (to start them on the server) and its page (to read them).
 */
export function ledgerMetaReads(client: Client, id: string) {
  const ledger = ledgerCanister(client, id)
  return {
    name: client.queryOptions(ledger, "icrc1_name"),
    symbol: client.queryOptions(ledger, "icrc1_symbol"),
    decimals: client.queryOptions(ledger, "icrc1_decimals"),
    fee: client.queryOptions(ledger, "icrc1_fee"),
  }
}

/** The ckBTC minter as a typed canister. */
export function minterCanister(client: Client) {
  return client.canister<MinterActor>(minterActor, { id: CKBTC_MINTER.id })
}

const INTERFACES = new Map<string, CanisterInterface>()

function typedInterface(
  entry: RegistryEntry,
  actor: CanisterInterface["actor"],
  module: RegistryEntry["module"]
): CanisterInterface {
  const cached = INTERFACES.get(entry.id)
  if (cached !== undefined) return cached
  const methods = methodsOf(actor)
  const byName = new Map(methods.map((method) => [method.name, method]))
  const iface: CanisterInterface = {
    canisterId: entry.id,
    name: entry.name,
    actor,
    methods,
    method: (name) => byName.get(name),
    source: { kind: "typed", module },
    omitted: [],
    registry: entry,
  }
  INTERFACES.set(entry.id, iface)
  return iface
}

/**
 * A wallet ledger's interface over the icrc1 module, for the shared
 * components (the confirm step, the error panel, the reply viewer, the
 * history). Built once per ledger from the generated service schema: plain
 * data, the same object every time.
 */
export function ledgerInterface(entry: RegistryEntry): CanisterInterface {
  return typedInterface(entry, icrc1Actor, "icrc1")
}

/** The ckBTC minter's interface, built the same way (for the history). */
export function minterInterface(): CanisterInterface {
  return typedInterface(CKBTC_MINTER, minterActor, "ckbtc_minter")
}

/** `icrc1_transfer` of a wallet ledger's interface. */
export function transferMethod(iface: CanisterInterface): MethodInfo {
  const method = iface.method("icrc1_transfer")
  if (method === undefined) throw new Error("icrc1 has no icrc1_transfer")
  return method
}
