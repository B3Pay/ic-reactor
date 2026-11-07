import { describe, expect, it } from "vitest"
import { checkCanisterId, MANAGEMENT_CANISTER_ID } from "./ids.ts"

// A self-authenticating (user) principal: 29 bytes ending in 0x02.
const USER = "4twgc-viha4-dqoby-ha4dq-obyha-4dqob-yha4d-qobyh-a4dqo-byha4-dqe"
// Canonical principal text of 10 bytes ending in 0x02: not opaque.
const TEN_BYTES_NOT_OPAQUE = "bwcas-wqaaa-aaaaa-aaaaa-aaq"
// Canonical principal text of 9 bytes ending in 0x01: opaque, wrong length.
const NINE_BYTES = "sehci-oaaaa-aaaaa-aaaaa-c"

describe("checkCanisterId", () => {
  it("accepts canister ids of any network", () => {
    for (const id of [
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "mxzaz-hqaaa-aaaar-qaada-cai",
      "rdmx6-jaaaa-aaaaa-aaadq-cai",
      // A local replica's first canister.
      "bkyz2-fmaaa-aaaaa-qaaaq-cai",
    ]) {
      expect(checkCanisterId(id)).toEqual({ ok: true, id })
    }
  })

  it("refuses the management canister by name", () => {
    expect(checkCanisterId(MANAGEMENT_CANISTER_ID)).toMatchObject({
      ok: false,
      code: "management_canister",
    })
  })

  it("refuses principals that are not canister ids", () => {
    for (const text of ["2vxsx-fae", USER, TEN_BYTES_NOT_OPAQUE, NINE_BYTES]) {
      expect(checkCanisterId(text)).toMatchObject({
        ok: false,
        code: "invalid_canister_id",
        message: expect.stringMatching(/not a canister id/),
      })
    }
  })

  it("refuses text that is not canonical, without repairing it", () => {
    for (const text of [
      "",
      "RYJL3-TYAAA-AAAAA-AAABA-CAI",
      " ryjl3-tyaaa-aaaaa-aaaba-cai",
      "ryjl3tyaaaaaaaaaaabacai",
      "ryjl3-tyaaa-aaaaa-aaaba-cal",
      "ryjl3-tyaaa-aaaaa-aaaba-cai/",
      "x".repeat(10_000),
    ]) {
      const check = checkCanisterId(text)
      expect(check.ok).toBe(false)
      if (!check.ok) {
        expect(check.code).toBe("invalid_canister_id")
        expect(check.message.length).toBeGreaterThan(0)
      }
    }
    expect(checkCanisterId("y".repeat(64))).toMatchObject({
      message: "Principal text is at most 63 characters.",
    })
  })

  it("refuses, without throwing, a value that is not text at all", () => {
    for (const value of [undefined, null, 42, { toText: () => "aaaaa-aa" }]) {
      expect(checkCanisterId(value as unknown as string)).toMatchObject({
        ok: false,
        code: "invalid_canister_id",
      })
    }
  })
})
