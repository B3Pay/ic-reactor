import { describe, expect, it } from "vitest"
import { fromHex, sha256Hex, toHex } from "./hex.ts"

describe("toHex / fromHex", () => {
  it("round-trips bytes as lower-case hex", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 254, 255])
    expect(toHex(bytes)).toBe("00010f107f80feff")
    expect(fromHex("00010f107f80feff")).toEqual(bytes)
    expect(toHex(new Uint8Array())).toBe("")
    expect(fromHex("")).toEqual(new Uint8Array())
  })

  it("reads a 0x prefix, upper case and surrounding whitespace", () => {
    expect(fromHex("0x4449444C0000")).toEqual(
      new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0, 0])
    )
    expect(fromHex("  0Xab \n")).toEqual(new Uint8Array([0xab]))
  })

  it("refuses odd lengths, separators and non-hex digits", () => {
    for (const text of ["abc", "0x0", "ab cd", "ab:cd", "zz", "0xg0", "-1"]) {
      expect(fromHex(text)).toBeUndefined()
    }
  })
})

describe("sha256Hex", () => {
  it("hashes with Web Crypto", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })

  it("hashes only the view's bytes, not its whole buffer", async () => {
    const buffer = new Uint8Array([0, 0x61, 0x62, 0x63, 0])
    expect(await sha256Hex(buffer.subarray(1, 4))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })
})
