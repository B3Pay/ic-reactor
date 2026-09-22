import { didToDisplayCodec } from "@ic-reactor/core"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it } from "vitest"
import { ResultFieldVisitor } from "../../src/visitor/returns/index.js"

/**
 * A result node's resolve() takes a value in its Candid form or already
 * display-transformed, and builds the same tree from either. For an optional
 * it read any array as the Candid `[value]` wrapper and resolved its first
 * item, so a display value that is itself an array, `opt vec text` as
 * ["a", "b"] or `opt record { nat; nat }` as ["1", "2"], threw. A
 * `vec record { text; V }` displays as an object keyed by the text, which the
 * vector node rejected.
 */

const canister = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

/** The metadata of a query returning one value of `type`. */
function resultOf(type: IDL.Type) {
  const service = IDL.Service({ m: IDL.Func([], [type], ["query"]) })
  const meta = service.accept(new ResultFieldVisitor(), null as never) as any
  return (value: unknown) => meta.m.resolve(value).results[0]
}

/** The display values a resolved tree carries, for comparing two trees. */
function leaves(node: any): unknown {
  switch (node.type) {
    case "optional":
      return node.value === null ? "none" : { some: leaves(node.value) }
    case "record":
    case "funcRecord":
      return Object.fromEntries(
        Object.entries(node.fields).map(([k, v]) => [k, leaves(v)])
      )
    case "tuple":
    case "vector":
      return node.items.map(leaves)
    case "variant":
      return { [node.selected]: leaves(node.selectedValue) }
    case "recursive":
      return leaves(node.inner)
    case "func":
      return `${node.canisterId}.${node.methodName}`
    case "blob":
      return `${node.value} (${node.length} bytes)`
    default:
      return node.value
  }
}

/** Resolves `raw` and its display value, and returns both trees' leaves. */
function bothWays(type: IDL.Type, raw: unknown) {
  const resolve = resultOf(type)
  const display = didToDisplayCodec(type).asDisplay(raw as never)
  return { raw: leaves(resolve(raw)), display: leaves(resolve(display)) }
}

describe("resolve() of display-transformed values", () => {
  it.each([
    ["opt vec text", IDL.Opt(IDL.Vec(IDL.Text)), [["a", "b"]]],
    ["opt vec text with one item", IDL.Opt(IDL.Vec(IDL.Text)), [["a"]]],
    [
      "opt record { nat; nat }",
      IDL.Opt(IDL.Tuple(IDL.Nat, IDL.Nat)),
      [[1n, 2n]],
    ],
    [
      "opt func",
      IDL.Opt(IDL.Func([], [], ["query"])),
      [[canister, "get_blocks"]],
    ],
    ["opt vec vec nat", IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat))), [[[1n], [2n, 3n]]]],
    [
      "vec record { text; nat }",
      IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)),
      [
        ["icrc1:fee", 10_000n],
        ["icrc1:decimals", 8n],
      ],
    ],
    [
      "opt vec record { text; nat }",
      IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))),
      [[["icrc1:fee", 10_000n]]],
    ],
    // Displayed as `{ _type: "none" }`, with no payload key.
    [
      "a variant arm without a payload",
      IDL.Variant({ ok: IDL.Nat, none: IDL.Null }),
      { none: null },
    ],
  ])("builds the same tree for %s", (_name, type, raw) => {
    const { raw: fromRaw, display: fromDisplay } = bothWays(type, raw)
    expect(fromDisplay).toEqual(fromRaw)
  })

  it("still reads a Candid optional as its wrapper", () => {
    const resolve = resultOf(IDL.Opt(IDL.Vec(IDL.Text)))
    expect(leaves(resolve([]))).toBe("none")
    expect(leaves(resolve([["a"]]))).toEqual({ some: ["a"] })
    expect(leaves(resolve([[]]))).toEqual({ some: [] })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: result types and values, resolved raw and display-transformed
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
  IDL.Int64,
  IDL.Nat16,
  IDL.Text,
  IDL.Bool,
  IDL.Principal,
  IDL.Vec(IDL.Nat8),
  IDL.Func([], [], ["query"]),
]

/**
 * A result type. An optional never holds another optional or null: their
 * none and some(none) display alike.
 */
function typeOf(r: Rng, depth: number, inOpt = false): IDL.Type {
  if (depth === 0) return r.pick(SCALARS)
  switch (r.int(6)) {
    case 0:
      return inOpt
        ? IDL.Vec(typeOf(r, depth - 1))
        : IDL.Opt(typeOf(r, depth - 1, true))
    case 1:
      return IDL.Vec(typeOf(r, depth - 1))
    case 2:
      return IDL.Tuple(typeOf(r, depth - 1), typeOf(r, depth - 1))
    case 3:
      return IDL.Vec(IDL.Tuple(IDL.Text, typeOf(r, depth - 1)))
    case 4:
      return IDL.Record({ a: typeOf(r, depth - 1), b: typeOf(r, depth - 1) })
    default:
      return IDL.Variant({ ok: typeOf(r, depth - 1), none: IDL.Null })
  }
}

/**
 * A value of `type`. Nothing under an optional is an empty vec, since a
 * displayed some(empty vec) is `[]`, the Candid form of none. Keys of a
 * text-keyed vec are distinct, since its display is an object.
 */
function valueOf(r: Rng, type: IDL.Type, underOpt = false): unknown {
  if (type instanceof IDL.OptClass)
    return !underOpt && r.int(4) === 0 ? [] : [valueOf(r, type._type, true)]
  if (type instanceof IDL.VecClass) {
    if (type._type instanceof IDL.FixedNatClass && type._type._bits === 8)
      return Uint8Array.from({ length: r.int(4) }, () => r.int(256))
    const length = underOpt ? 1 + r.int(2) : r.int(3)
    const items = Array.from({ length }, () => valueOf(r, type._type, underOpt))
    if (
      type._type instanceof IDL.TupleClass &&
      type._type._fields[0][1] instanceof IDL.TextClass
    )
      return items.map((item, i) => [`key${i}`, (item as unknown[])[1]])
    return items
  }
  if (type instanceof IDL.TupleClass)
    return type._fields.map(([, c]) => valueOf(r, c, underOpt))
  if (type instanceof IDL.RecordClass)
    return Object.fromEntries(
      type._fields.map(([k, c]) => [k, valueOf(r, c, underOpt)])
    )
  if (type instanceof IDL.VariantClass)
    return r.int(2) === 0
      ? { none: null }
      : { ok: valueOf(r, type._fields.find(([k]) => k === "ok")![1], underOpt) }
  if (type instanceof IDL.NatClass) return r.pick([0n, 2n ** 70n])
  if (type instanceof IDL.FixedIntClass) return r.pick([0n, -(2n ** 63n)])
  if (type instanceof IDL.FixedNatClass) return r.pick([0, 65535])
  if (type instanceof IDL.TextClass) return r.pick(["x", "héllo"])
  if (type instanceof IDL.BoolClass) return r.pick([true, false])
  if (type instanceof IDL.PrincipalClass) return canister
  if (type instanceof IDL.FuncClass) return [canister, "m"]
  throw new Error(`no value for ${type.display()}`)
}

describe("generated result values (seed 20260923)", () => {
  it("resolve builds the same tree from Candid and display values", () => {
    const r = rng(20260923)
    for (let i = 0; i < 200; i++) {
      const type = typeOf(r, 1 + r.int(3))
      const raw = IDL.decode([type], IDL.encode([type], [valueOf(r, type)]))[0]
      const { raw: fromRaw, display: fromDisplay } = bothWays(type, raw)
      expect(fromDisplay, type.display()).toEqual(fromRaw)
    }
  })
})
