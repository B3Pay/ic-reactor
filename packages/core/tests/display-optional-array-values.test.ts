import { describe, expect, it } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { didToDisplayCodec } from "../src/display/index.js"

/**
 * An optional's encode also takes the canonical `[value]` form, so a
 * one-element array is either that wrapper or an array value of the element
 * type. It was read as the wrapper whenever the element was not a vec, and
 * whenever its one item was an array. Every element type whose display value
 * is itself an array then failed to encode its own decoded value: a
 * one-element tuple, a vec of vecs, tuples or func references, and an
 * optional holding a vec.
 */

const canister = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

/** The value after an IDL round trip, with bigints and principals as text. */
function wire(type: IDL.Type, value: unknown): string {
  return JSON.stringify(
    IDL.decode([type], IDL.encode([type], [value])),
    (_k, v) =>
      typeof v === "bigint"
        ? `${v}n`
        : v instanceof Principal
          ? v.toText()
          : ArrayBuffer.isView(v)
            ? Array.from(v as unknown as ArrayLike<unknown>)
            : v
  )
}

/** Encodes the display value of `value` back to Candid. */
function roundTrip(type: IDL.Type, value: unknown): unknown {
  const codec = didToDisplayCodec(type)
  return codec.asCandid(codec.asDisplay(value as never))
}

describe("display codec — an optional holding an array-shaped value", () => {
  const cases: Array<[string, IDL.Type, unknown]> = [
    ["opt record { nat }", IDL.Opt(IDL.Tuple(IDL.Nat)), [[5n]]],
    ["opt vec vec nat", IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat))), [[[1n, 2n]]]],
    [
      "opt vec record { nat; principal }",
      IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Principal))),
      [[[1n, canister]]],
    ],
    ["opt opt vec text", IDL.Opt(IDL.Opt(IDL.Vec(IDL.Text))), [[["x"]]]],
    [
      "opt vec func",
      IDL.Opt(IDL.Vec(IDL.Func([], [], ["query"]))),
      [[[canister, "get_blocks"]]],
    ],
    ["opt record { opt nat }", IDL.Opt(IDL.Tuple(IDL.Opt(IDL.Nat))), [[[]]]],
    [
      "opt record { record { float64; nat32 } }",
      IDL.Opt(IDL.Tuple(IDL.Tuple(IDL.Float64, IDL.Nat32))),
      [[[1.5, 7]]],
    ],
  ]

  it.each(cases)(
    "encodes its own display value of %s",
    (_name, type, value) => {
      expect(wire(type, roundTrip(type, value))).toBe(wire(type, value))
    }
  )

  it("still reads the canonical wrapper around such a value", () => {
    const optTuple = didToDisplayCodec(IDL.Opt(IDL.Tuple(IDL.Nat)))
    expect(optTuple.asCandid([["5"]])).toEqual([[5n]])
    expect(optTuple.asCandid(["5"])).toEqual([[5n]])

    const optVecVec = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat))))
    expect(optVecVec.asCandid([[["1"]]])).toEqual([[[1n]]])
    expect(optVecVec.asCandid([["1"]])).toEqual([[[1n]]])
  })

  it("keeps the canonical reading when both fit", () => {
    // `[[]]` is some(empty vec) and also a vec holding one empty vec.
    const optVecVec = didToDisplayCodec(IDL.Opt(IDL.Vec(IDL.Vec(IDL.Text))))
    expect(optVecVec.asCandid([[]])).toEqual([[]])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: optionals over array-shaped types, random scalars and values
// ════════════════════════════════════════════════════════════════════════════

function rng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]
  return { int, pick }
}
type Rng = ReturnType<typeof rng>

const SCALARS: IDL.Type[] = [
  IDL.Nat,
  IDL.Int8,
  IDL.Nat16,
  IDL.Nat64,
  IDL.Float64,
  IDL.Text,
  IDL.Bool,
  IDL.Principal,
  IDL.Vec(IDL.Nat8),
]

/** Types that display as arrays, the ones an optional could confuse. */
function arrayShaped(r: Rng, depth: number): IDL.Type {
  const scalar = () => r.pick(SCALARS)
  const any = () =>
    depth > 0 && r.int(2) === 0 ? arrayShaped(r, depth - 1) : scalar()
  switch (r.int(5)) {
    case 0:
      return IDL.Tuple(any())
    case 1:
      return IDL.Tuple(any(), any())
    case 2:
      return IDL.Vec(
        depth > 0 ? arrayShaped(r, depth - 1) : IDL.Tuple(scalar())
      )
    case 3:
      return IDL.Func([scalar()], [], ["query"])
    default:
      return IDL.Vec(any())
  }
}

/**
 * A value of `type`. Nothing under an optional is an empty vec, and an
 * optional inside another is always some: `[]` and `[[]]` there fit both
 * readings, and the codec keeps the canonical one.
 */
function valueOf(r: Rng, type: IDL.Type, underOpt: boolean): unknown {
  if (type instanceof IDL.OptClass) {
    if (!underOpt && r.int(4) === 0) return []
    return [valueOf(r, type._type, true)]
  }
  if (type instanceof IDL.VecClass) {
    if (type._type instanceof IDL.FixedNatClass && type._type._bits === 8) {
      return Uint8Array.from({ length: 1 + r.int(4) }, () => r.int(256))
    }
    const length = underOpt ? 1 + r.int(2) : r.int(3)
    return Array.from({ length }, () => valueOf(r, type._type, underOpt))
  }
  if (type instanceof IDL.TupleClass) {
    return type._fields.map(([, component]) => valueOf(r, component, underOpt))
  }
  if (type instanceof IDL.FuncClass) return [canister, r.pick(["m", "get"])]
  if (type instanceof IDL.PrincipalClass) return canister
  if (type instanceof IDL.NatClass) return r.pick([0n, 2n ** 80n])
  if (type instanceof IDL.FixedNatClass)
    return type._bits === 64 ? r.pick([0n, 2n ** 64n - 1n]) : r.pick([0, 9])
  if (type instanceof IDL.FixedIntClass) return r.pick([-128, 127])
  if (type instanceof IDL.FloatClass) return r.pick([0.5, -2, 1e300])
  if (type instanceof IDL.TextClass) return r.pick(["x", ""])
  if (type instanceof IDL.BoolClass) return r.pick([true, false])
  throw new Error(`no value for ${type.display()}`)
}

describe("generated optionals over array-shaped types (seed 20260923)", () => {
  it("encodes every display value it decodes", () => {
    const r = rng(20260923)
    for (let i = 0; i < 300; i++) {
      const inner = arrayShaped(r, 2)
      const type = r.int(3) === 0 ? IDL.Opt(IDL.Opt(inner)) : IDL.Opt(inner)
      const value = valueOf(r, type, false)
      expect(
        wire(type, roundTrip(type, value)),
        `${type.display()} ${wire(type, value)}`
      ).toBe(wire(type, value))
    }
  })
})
