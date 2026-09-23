import { describe, it, expect, vi, afterEach } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { DisplayCodecVisitor, didToDisplayCodec } from "../src/display/index.js"

/**
 * A recursive type's codec is built lazily, because the type refers back to
 * itself. It was built again on every call, though: each decode and encode
 * of a recursive node visited the whole type anew and constructed fresh Zod
 * codecs for every arm, so the work grew with the number of nodes times the
 * size of the type.
 *
 * ICRC-3 blocks are exactly that shape. 1000 `icrc3_get_blocks` blocks took
 * about 470 ms to display-transform on a laptop, against 26 ms for IDL.decode
 * of the same bytes; with the codec built once it takes about 16 ms. The
 * tests count codec builds rather than time them, so they cannot flake.
 */

// The ICRC-3 generic block value.
const Value = IDL.Rec()
Value.fill(
  IDL.Variant({
    Int: IDL.Int,
    Map: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    Nat: IDL.Nat,
    Nat64: IDL.Nat64,
    Blob: IDL.Vec(IDL.Nat8),
    Text: IDL.Text,
    Array: IDL.Vec(Value),
  })
)

const block = (i: number) => ({
  Map: [
    ["btype", { Text: "1xfer" }],
    ["ts", { Nat: BigInt(i) }],
    ["phash", { Blob: new Uint8Array(32).fill(i) }],
    [
      "tx",
      {
        Map: [
          ["amt", { Nat: 1000n }],
          ["from", { Array: [{ Blob: new Uint8Array(29) }] }],
          ["memo", { Blob: new Uint8Array([1, 2, 3]) }],
        ],
      },
    ],
  ],
})

const Blocks = IDL.Vec(Value)
const BLOCKS = Array.from({ length: 20 }, (_, i) => block(i))
// Every block above holds 9 Value nodes.
const NODES = BLOCKS.length * 9

afterEach(() => {
  vi.restoreAllMocks()
})

describe("display codec — recursive types", () => {
  it("builds a recursive type's codec once, not once per decoded node", () => {
    const codec = didToDisplayCodec(Blocks)
    const decoded = IDL.decode([Blocks], IDL.encode([Blocks], [BLOCKS]))[0]
    const builds = vi.spyOn(DisplayCodecVisitor.prototype, "visitVariant")

    codec.asDisplay(decoded as never)
    codec.asDisplay(decoded as never)

    // The first decode builds the variant's codec; nothing rebuilds it.
    expect(builds.mock.calls.length).toBeLessThanOrEqual(1)
    expect(builds.mock.calls.length).toBeLessThan(NODES)
  })

  it("builds it once for encoding too", () => {
    const codec = didToDisplayCodec(Blocks)
    const display = codec.asDisplay(
      IDL.decode([Blocks], IDL.encode([Blocks], [BLOCKS]))[0] as never
    )
    const builds = vi.spyOn(DisplayCodecVisitor.prototype, "visitVariant")

    codec.asCandid(display)
    codec.asCandid(display)

    expect(builds.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it("still displays and round-trips the blocks exactly", () => {
    const codec = didToDisplayCodec(Blocks)
    const bytes = IDL.encode([Blocks], [BLOCKS])

    const display = codec.asDisplay(IDL.decode([Blocks], bytes)[0] as never)

    expect((display as unknown[])[3]).toEqual({
      _type: "Map",
      Map: {
        btype: { _type: "Text", Text: "1xfer" },
        ts: { _type: "Nat", Nat: "3" },
        phash: { _type: "Blob", Blob: "03".repeat(32) },
        tx: {
          _type: "Map",
          Map: {
            amt: { _type: "Nat", Nat: "1000" },
            from: {
              _type: "Array",
              Array: [{ _type: "Blob", Blob: "00".repeat(29) }],
            },
            memo: { _type: "Blob", Blob: "010203" },
          },
        },
      },
    })
    expect(IDL.encode([Blocks], [codec.asCandid(display)])).toEqual(bytes)
  })

  it("handles mutually recursive types", () => {
    // A ↔ B through both arms of the recursion.
    const A = IDL.Rec()
    const B = IDL.Rec()
    A.fill(IDL.Record({ label: IDL.Text, children: IDL.Vec(B) }))
    B.fill(IDL.Variant({ leaf: IDL.Nat, node: A }))
    const value = {
      label: "root",
      children: [
        { leaf: 1n },
        { node: { label: "inner", children: [{ leaf: 2n }] } },
      ],
    }
    const bytes = IDL.encode([A], [value])
    const codec = didToDisplayCodec(A)

    const display = codec.asDisplay(IDL.decode([A], bytes)[0] as never)

    expect(display).toEqual({
      label: "root",
      children: [
        { _type: "leaf", leaf: "1" },
        {
          _type: "node",
          node: { label: "inner", children: [{ _type: "leaf", leaf: "2" }] },
        },
      ],
    })
    expect(IDL.encode([A], [codec.asCandid(display)])).toEqual(bytes)
  })
})
