import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * A `vec` of 2-tuples is displayed as an object keyed by the first element —
 * but only when that element is `text`. It used to accept ANY 2-tuple, so a
 * non-primitive key was stringified by `Object.fromEntries` and every entry
 * collapsed onto "[object Object]".
 *
 * `DisplayOf` already declared the correct shape: `Record<string, …>` only for
 * `Array<[string, B]>`, everything else stays an array. The runtime was the
 * side that disagreed.
 */
describe("display codec — vec of 2-tuples", () => {
  const owner = Principal.fromText("aaaaa-aa")

  describe("non-text keys keep the array shape", () => {
    const accountPairs = () =>
      didToDisplayCodec(
        IDL.Vec(IDL.Tuple(IDL.Record({ owner: IDL.Principal }), IDL.Nat))
      )

    it("preserves every entry when the key is a record", () => {
      // `vec record { Account; nat }` is a real shape — the ckBTC ledger's
      // InitArgs.initial_balances. Both entries must survive.
      const display = accountPairs().asDisplay([
        [{ owner }, 1n],
        [{ owner }, 2n],
      ])

      expect(Array.isArray(display)).toBe(true)
      expect(display).toHaveLength(2)
      expect(display).toEqual([
        [{ owner: "aaaaa-aa" }, "1"],
        [{ owner: "aaaaa-aa" }, "2"],
      ])
    })

    it("does not collapse identical record keys onto one entry", () => {
      const display = accountPairs().asDisplay([
        [{ owner }, 10n],
        [{ owner }, 20n],
        [{ owner }, 30n],
      ]) as unknown[]

      expect(display).toHaveLength(3)
    })

    it("keeps the array shape for a nat key too", () => {
      const natKeyed = didToDisplayCodec(IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Text)))
      expect(
        natKeyed.asDisplay([
          [1n, "x"],
          [2n, "y"],
        ])
      ).toEqual([
        ["1", "x"],
        ["2", "y"],
      ])
    })
  })

  describe("text keys keep the object ergonomic", () => {
    const metadata = () =>
      didToDisplayCodec(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)))

    it("maps text-keyed pairs to an object", () => {
      // This is the icrc1_metadata shape and the reason the special case exists.
      expect(
        metadata().asDisplay([
          ["icrc1:decimals", 8n],
          ["icrc1:fee", 10n],
        ])
      ).toEqual({ "icrc1:decimals": "8", "icrc1:fee": "10" })
    })

    it("round-trips back to candid pairs", () => {
      expect(metadata().asCandid({ "icrc1:decimals": "8" } as never)).toEqual([
        ["icrc1:decimals", 8n],
      ])
    })

    it("holds each key once, integer-like keys first, as documented (#633)", () => {
      // Guards the limits the DisplayReactor reference and the core README
      // state. A change to the display shape has to change them too.
      const headers = didToDisplayCodec(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)))
      expect(
        headers.asDisplay([
          ["set-cookie", "a=1"],
          ["set-cookie", "b=2"],
          ["content-type", "text/plain"],
        ])
      ).toEqual({ "set-cookie": "b=2", "content-type": "text/plain" })

      const display = metadata().asDisplay([
        ["10", 1n],
        ["2", 2n],
        ["b", 3n],
        ["1", 4n],
      ])
      expect(Object.keys(display as object)).toEqual(["1", "2", "10", "b"])
      expect(metadata().asCandid(display as never)).toEqual([
        ["1", 4n],
        ["2", 2n],
        ["10", 1n],
        ["b", 3n],
      ])
    })
  })
})
