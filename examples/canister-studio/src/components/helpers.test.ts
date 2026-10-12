import { describe, expect, it } from "vitest"
import type { MethodInfo } from "../interface/types.ts"
import { CURATED, KNOWN_CANISTERS, REGISTRY } from "../lib/registry.ts"
import { judgeCanisterId } from "./canister-id-input.ts"
import { canisterDisplayName } from "./canister-names.ts"
import { safeFileName } from "./download.ts"
import { modeCounts } from "./modes.ts"
import { provenanceShort, provenanceText } from "./provenance.ts"

describe("judgeCanisterId", () => {
  it("trims, then accepts a canister id", () => {
    expect(judgeCanisterId("  ryjl3-tyaaa-aaaaa-aaaba-cai \n")).toEqual({
      state: "ok",
      id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    })
  })

  it("is empty for blank text", () => {
    expect(judgeCanisterId("   ")).toEqual({ state: "empty" })
  })

  it("explains what is wrong, never repairing the text", () => {
    for (const text of [
      "RYJL3-TYAAA-AAAAA-AAABA-CAI",
      "ryjl3tyaaaaaaaaaaabacai",
      "2vxsx-fae",
      "aaaaa-aa",
    ]) {
      const verdict = judgeCanisterId(text)
      expect(verdict.state).toBe("invalid")
      if (verdict.state === "invalid") expect(verdict.message).not.toBe("")
    }
  })
})

describe("canisterDisplayName", () => {
  it("prefers the registry, then the curated list, then the short id", () => {
    expect(canisterDisplayName("ryjl3-tyaaa-aaaaa-aaaba-cai")).toBe(
      "ICP ledger"
    )
    expect(canisterDisplayName("rrkah-fqaaa-aaaaa-aaaaq-cai")).toBe(
      "NNS governance"
    )
    expect(canisterDisplayName("ryjl3-tyaaa-aaaaa-aaaba-caj")).toBe(
      "Canister ryjl3-…-caj"
    )
  })

  it("suggests every known canister once", () => {
    expect(KNOWN_CANISTERS).toHaveLength(REGISTRY.length + CURATED.length)
    expect(new Set(KNOWN_CANISTERS.map((k) => k.id)).size).toBe(
      KNOWN_CANISTERS.length
    )
  })
})

describe("modeCounts", () => {
  const method = (mode: MethodInfo["mode"]): MethodInfo => ({
    name: mode,
    mode,
    args: [],
    results: [],
  })

  it("counts in mode order and leaves absent modes out", () => {
    expect(
      modeCounts([
        method("update"),
        method("query"),
        method("oneway"),
        method("query"),
      ])
    ).toEqual([
      { mode: "query", count: 2 },
      { mode: "update", count: 1 },
      { mode: "oneway", count: 1 },
    ])
    expect(modeCounts([])).toEqual([])
  })
})

describe("safeFileName", () => {
  it("keeps names file systems accept", () => {
    expect(safeFileName("icp-ledger")).toBe("icp-ledger")
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd")
    expect(safeFileName("Canister ryjl3-…-cai")).toBe("Canister-ryjl3-cai")
    expect(safeFileName("///")).toBe("canister")
  })
})

describe("provenance", () => {
  it("labels an uncertified interface as such", () => {
    const source = {
      kind: "tmp_hack",
      certified: false,
      moduleHash: null,
    } as const
    expect(provenanceText(source)).toMatch(/nobody certified/)
    expect(provenanceShort(source)).toMatch(/not certified/)
  })

  it("names the typed module", () => {
    expect(provenanceShort({ kind: "typed", module: "icp_ledger" })).toBe(
      "Committed .did, typed by src/canisters/icp_ledger.ts"
    )
  })
})
