import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * `opt` fields are declared `[] | [T]` by generated `_SERVICE` types, so those
 * are the forms a developer naturally writes. They used to be rejected: `[]` is
 * not nullish, so it was handed straight to the element codec, which for a blob
 * accepted only `string | Uint8Array`.
 */
describe("display codec — canonical Candid optional argument forms", () => {
  const optBlob = () => didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Nat8)))
  const optText = () => didToDisplayCodec(IDL.Opt(IDL.Text))

  describe("opt blob (the icrc1 subaccount shape)", () => {
    it("accepts [] as none", () => {
      expect(optBlob().asCandid([])).toEqual([])
    })

    it("accepts [Uint8Array] as some", () => {
      const bytes = Uint8Array.from([1, 2, 3])
      expect(optBlob().asCandid([bytes])).toEqual([bytes])
    })

    it("accepts [number[]] as some", () => {
      expect(optBlob().asCandid([[1, 2, 3]])).toEqual([
        Uint8Array.from([1, 2, 3]),
      ])
    })

    it("still accepts null, undefined and a bare value", () => {
      expect(optBlob().asCandid(null)).toEqual([])
      expect(optBlob().asCandid(undefined)).toEqual([])
      const bytes = Uint8Array.from([9])
      expect(optBlob().asCandid(bytes)).toEqual([bytes])
    })

    it("accepts a bare number[] as a blob value", () => {
      // DisplayOf types a blob as Uint8Array | number[] | string, so the
      // display side must accept number[] as well.
      expect(optBlob().asCandid([[255]])).toEqual([Uint8Array.from([255])])
    })
  })

  describe("opt text", () => {
    it("accepts [] as none and [value] as some", () => {
      expect(optText().asCandid([])).toEqual([])
      expect(optText().asCandid(["hi"])).toEqual(["hi"])
    })

    it("still accepts a bare value", () => {
      expect(optText().asCandid("hi")).toEqual(["hi"])
    })
  })

  describe("round-trip", () => {
    it("decodes none to a nullish value and some to the value", () => {
      expect(optText().asDisplay([])).toBeUndefined()
      expect(optText().asDisplay(["hi"])).toBe("hi")
    })
  })
})
