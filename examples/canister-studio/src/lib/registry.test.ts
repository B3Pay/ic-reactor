import { serviceMethods } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import { checkCanisterId } from "./ids.ts"
import { CURATED, REGISTRY, registryEntry } from "./registry.ts"

describe("REGISTRY", () => {
  it("holds the four typed canisters at their mainnet ids", () => {
    expect(REGISTRY.map((e) => [e.id, e.module])).toEqual([
      ["ryjl3-tyaaa-aaaaa-aaaba-cai", "icp_ledger"],
      ["mxzaz-hqaaa-aaaar-qaada-cai", "icrc1"],
      ["ss2fx-dyaaa-aaaar-qacoq-cai", "icrc1"],
      ["mqygn-kiaaa-aaaar-qaadq-cai", "ckbtc_minter"],
    ])
  })

  it("has valid canister ids and unique ids and slugs", () => {
    for (const entry of REGISTRY)
      expect(checkCanisterId(entry.id).ok).toBe(true)
    expect(new Set(REGISTRY.map((e) => e.id)).size).toBe(REGISTRY.length)
    expect(new Set(REGISTRY.map((e) => e.slug)).size).toBe(REGISTRY.length)
  })

  it("types every entry with its module's actor and .did text", () => {
    for (const entry of REGISTRY) {
      const methods = serviceMethods(entry.actor)
      expect(methods.size).toBeGreaterThan(0)
      expect(entry.did).toMatch(/service\s*:/)
      if (entry.kind !== "ckbtc-minter") {
        expect(methods.get("icrc1_transfer")?.mode).toBe("update")
        expect(methods.get("icrc1_balance_of")?.mode).toBe("query")
        expect(entry.decimals).toBeTypeOf("number")
        expect(entry.symbol).toBeTypeOf("string")
      }
    }
    const minter = registryEntry("mqygn-kiaaa-aaaar-qaadq-cai")
    const methods = serviceMethods(minter!.actor)
    expect(methods.get("get_minter_info")?.mode).toBe("query")
    expect(methods.get("estimate_withdrawal_fee")?.mode).toBe("query")
  })

  it("names only update methods as idempotent updates", () => {
    for (const entry of REGISTRY) {
      const methods = serviceMethods(entry.actor)
      for (const name of entry.idempotentUpdates ?? []) {
        expect(methods.get(name)?.mode).toBe("update")
      }
    }
    expect(
      registryEntry("mqygn-kiaaa-aaaar-qaadq-cai")?.idempotentUpdates
    ).toEqual(["get_btc_address"])
  })

  it("finds entries by id only", () => {
    expect(registryEntry("ryjl3-tyaaa-aaaaa-aaaba-cai")?.slug).toBe(
      "icp-ledger"
    )
    expect(registryEntry("icp-ledger")).toBeUndefined()
    expect(registryEntry("__proto__")).toBeUndefined()
  })
})

describe("CURATED", () => {
  it("lists valid, unique canister ids outside the registry", () => {
    const ids = CURATED.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of CURATED) {
      expect(checkCanisterId(entry.id).ok).toBe(true)
      expect(registryEntry(entry.id)).toBeUndefined()
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.note.length).toBeGreaterThan(0)
    }
    expect(ids).toContain("um5iw-rqaaa-aaaaq-qaaba-cai")
  })
})
