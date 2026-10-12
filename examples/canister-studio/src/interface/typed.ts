// Registry canisters: their interface is a committed .did and the module
// generated from it, so they need no live read and no compiler.
import { sha256Hex } from "../lib/hex.ts"
import type { RegistryEntry } from "../lib/registry.ts"
import { methodDocsFromModule } from "./docs.ts"
import type { InterfacePayload } from "./types.ts"

// Lazy: each module's text is its own chunk, fetched only when a page of
// that canister needs its docs or its source.
const MODULE_TEXT: Record<
  RegistryEntry["module"],
  () => Promise<{ default: string }>
> = {
  icrc1: () => import("../canisters/icrc1.ts?raw"),
  icp_ledger: () => import("../canisters/icp_ledger.ts?raw"),
  ckbtc_minter: () => import("../canisters/ckbtc_minter.ts?raw"),
}

/** The committed generated module of a registry canister, as text. */
export async function typedModuleText(
  module: RegistryEntry["module"]
): Promise<string> {
  return (await MODULE_TEXT[module]()).default
}

const payloads = new Map<
  string,
  Promise<Extract<InterfacePayload, { ok: true }>>
>()

/**
 * The payload of a registry canister: its committed .did, and the docs of
 * the module generated from it. The same promise for the same canister.
 */
export function typedPayload(
  entry: RegistryEntry
): Promise<Extract<InterfacePayload, { ok: true }>> {
  let payload = payloads.get(entry.id)
  if (payload === undefined) {
    payload = buildTypedPayload(entry)
    payloads.set(entry.id, payload)
  }
  return payload
}

async function buildTypedPayload(
  entry: RegistryEntry
): Promise<Extract<InterfacePayload, { ok: true }>> {
  const [didSha256, docs] = await Promise.all([
    sha256Hex(new TextEncoder().encode(entry.did)),
    typedModuleText(entry.module).then(methodDocsFromModule, () => {
      // A chunk that fails to load costs the docs, not the page; the next
      // payload asks again.
      payloads.delete(entry.id)
      return {}
    }),
  ])
  return {
    ok: true,
    canisterId: entry.id,
    source: { kind: "typed", module: entry.module },
    did: entry.did,
    didSha256,
    docs,
    fetchedAt: 0,
    cache: "typed",
  }
}
