import { describe, expect, it } from "vitest"
import { SUBACCOUNT_BYTES, parseSubaccount, toHex } from "./format.ts"

describe("reading a typed subaccount", () => {
  it("reads empty text as the default account", () => {
    expect(parseSubaccount("  ")).toEqual({ ok: true, bytes: null })
  })

  it("gives 32 bytes for 64 hex digits, a 0x prefix allowed", () => {
    const hex = "ab".repeat(SUBACCOUNT_BYTES)
    const read = parseSubaccount(`0x${hex}`)
    expect(read.ok && read.bytes?.length).toBe(SUBACCOUNT_BYTES)
    expect(read.ok && read.bytes && toHex(read.bytes)).toBe(hex)
  })

  it("pads shorter hex with zeros on the left to 32 bytes, so 1 is subaccount 1", () => {
    for (const [typed, last] of [
      ["1", "01"],
      ["ab", "ab"],
      ["abc", "0abc"],
    ] as const) {
      const read = parseSubaccount(typed)
      expect(read.ok && read.bytes?.length).toBe(SUBACCOUNT_BYTES)
      expect(read.ok && read.bytes && toHex(read.bytes)).toBe(
        last.padStart(SUBACCOUNT_BYTES * 2, "0")
      )
    }
  })

  it("refuses more than 64 hex digits instead of sending a subaccount the ledger traps on", () => {
    const read = parseSubaccount("0".repeat(SUBACCOUNT_BYTES * 2 + 2))
    expect(read).toEqual({
      ok: false,
      reason: "A subaccount is 32 bytes: at most 64 hex digits.",
    })
  })

  it("refuses text that is not hex", () => {
    expect(parseSubaccount("xyz").ok).toBe(false)
  })
})
