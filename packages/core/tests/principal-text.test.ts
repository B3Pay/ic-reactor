/**
 * `isPrincipalText`: whether a value is the text of a principal.
 *
 * Examples validated a principal a person typed with a `try` around
 * `Principal.fromText`, and `@ic-reactor/candid` carried the same check as
 * `isPrincipalId`, which core users could not reach. These tests pin what
 * passes (canonical text `Principal.fromText` reads, up to the 29 bytes the
 * Internet Computer accepts, and not the JSON form it also reads) and that
 * the check never throws.
 */
import { describe, it, expect, expectTypeOf } from "vitest"
import { Principal } from "@icp-sdk/core/principal"
import { isPrincipalText } from "../src/index.js"

describe("isPrincipalText", () => {
  it("accepts user, canister, management and anonymous principals", () => {
    expect(isPrincipalText("ryjl3-tyaaa-aaaaa-aaaba-cai")).toBe(true)
    expect(isPrincipalText("aaaaa-aa")).toBe(true)
    expect(isPrincipalText("2vxsx-fae")).toBe(true)
    const user = Principal.fromUint8Array(new Uint8Array(29).fill(7)).toText()
    expect(isPrincipalText(user)).toBe(true)
  })

  it("accepts the text Principal.fromText reads, and nothing it refuses", () => {
    for (const text of [
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "ryjl3-tyaaa", // checksum does not match
      "ryjl3-tyaaa-aaaaa-aaaba-cax", // one character off
      " aaaaa-aa", // whitespace
      "aaaaa-aa\n",
      "RYJL3-TYAAA-AAAAA-AAABA-CAI", // not canonical
      "ryjl3tyaaaaaaaaaaabacai", // no dashes
      "",
      "not-a-principal",
    ]) {
      let reads: boolean
      try {
        Principal.fromText(text)
        reads = true
      } catch {
        reads = false
      }
      expect(isPrincipalText(text), JSON.stringify(text)).toBe(reads)
    }
    expect(isPrincipalText("ryjl3-tyaaa")).toBe(false)
    expect(isPrincipalText(" aaaaa-aa")).toBe(false)
    expect(isPrincipalText("RYJL3-TYAAA-AAAAA-AAABA-CAI")).toBe(false)
  })

  it("refuses the JSON form, which Principal.fromText also reads", () => {
    // Principal.toJSON writes this, and Principal.fromText parses it back,
    // whitespace and all. It is not the principal's text: shown, compared or
    // used as a query key, it differs from "aaaaa-aa".
    for (const json of [
      '{"__principal__":"aaaaa-aa"}',
      JSON.stringify(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")),
      ' { "__principal__" : "2vxsx-fae" } ',
    ]) {
      expect(() => Principal.fromText(json)).not.toThrow()
      expect(isPrincipalText(json), json).toBe(false)
    }
  })

  it("refuses a principal longer than the 29 bytes the Internet Computer accepts", () => {
    const long = Principal.fromUint8Array(new Uint8Array(30).fill(7)).toText()
    // Principal.fromText reads it, but no call can name it.
    expect(Principal.fromText(long).toUint8Array()).toHaveLength(30)
    expect(isPrincipalText(long)).toBe(false)
  })

  it("is false, not an error, for anything that is not a string", () => {
    for (const value of [
      undefined,
      null,
      42,
      42n,
      {},
      [],
      Principal.fromText("aaaaa-aa"),
    ]) {
      expect(isPrincipalText(value)).toBe(false)
    }
  })

  it("returns a boolean, so a string it refuses keeps its type", () => {
    expectTypeOf(isPrincipalText).parameter(0).toBeUnknown()
    expectTypeOf(isPrincipalText).returns.toEqualTypeOf<boolean>()
    const input: string = "ryjl3-tyaaa"
    if (!isPrincipalText(input)) {
      // A type guard would narrow this to never.
      expectTypeOf(input).toEqualTypeOf<string>()
    }
  })
})
