import {
  c,
  isBoxedOpt,
  principal,
  serviceMethods,
  type AnyFieldSchema,
  type AnySchema,
} from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { describe, expect, it } from "vitest"
import { actor as minterActor } from "../canisters/ckbtc_minter.ts"
import { actor as icpActor } from "../canisters/icp_ledger.ts"
import { actor as icrc1Actor, TransferArg } from "../canisters/icrc1.ts"
import { candidArgsText, candidString, candidText } from "./candid-text.ts"
import { armOf, elementsOf, fieldsOf, isTagOnly, resolve } from "./schema.ts"

// Every expected text here was also fed to didc 0.5.4 (`didc encode`), which
// reads it back to the same bytes; CI has no didc, so the strings are pinned.

const LEDGER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const ANONYMOUS = principal("2vxsx-fae")

describe("candidText: primitives", () => {
  it("prints null, reserved, bool and text", () => {
    expect(candidText(c.null, null)).toBe("null")
    expect(candidText(c.reserved, "anything")).toBe("null")
    expect(candidText(c.bool, true)).toBe("true")
    expect(candidText(c.text, "hi")).toBe('"hi"')
    expect(candidText(c.text, "")).toBe('""')
  })

  it("annotates every number with its type and groups digits with _", () => {
    expect(candidText(c.nat, 0n)).toBe("0 : nat")
    expect(candidText(c.nat, 1_234_567n)).toBe("1_234_567 : nat")
    expect(candidText(c.int, -1_234n)).toBe("-1_234 : int")
    expect(candidText(c.int, -123n)).toBe("-123 : int")
    expect(candidText(c.nat64, 2n ** 64n - 1n)).toBe(
      "18_446_744_073_709_551_615 : nat64"
    )
    expect(candidText(c.int64, -(2n ** 63n))).toBe(
      "-9_223_372_036_854_775_808 : int64"
    )
    expect(candidText(c.nat8, 255)).toBe("255 : nat8")
    expect(candidText(c.nat16, 65_535)).toBe("65_535 : nat16")
    expect(candidText(c.nat32, 4_294_967_295)).toBe("4_294_967_295 : nat32")
    expect(candidText(c.int8, -128)).toBe("-128 : int8")
    expect(candidText(c.int32, -2_147_483_648)).toBe("-2_147_483_648 : int32")
  })

  it("prints floats as Candid float literals", () => {
    expect(candidText(c.float64, 1)).toBe("1.0 : float64")
    expect(candidText(c.float64, -1.5e-7)).toBe("-1.5e-7 : float64")
    expect(candidText(c.float64, 1e21)).toBe("1e+21 : float64")
    expect(candidText(c.float64, -0)).toBe("-0.0 : float64")
    expect(candidText(c.float32, Math.fround(0.1))).toBe(
      "0.10000000149011612 : float32"
    )
    // No Candid literal exists for these; didc prints the same words.
    expect(candidText(c.float64, Number.NaN)).toBe("NaN : float64")
    expect(candidText(c.float64, Number.NEGATIVE_INFINITY)).toBe(
      "-inf : float64"
    )
  })

  it("quotes principals", () => {
    expect(candidText(c.principal, LEDGER)).toBe(
      'principal "ryjl3-tyaaa-aaaaa-aaaba-cai"'
    )
  })
})

describe("candidString", () => {
  it("escapes quotes, backslashes and line breaks", () => {
    expect(candidString('say "hi" \\ bye\n\t\r')).toBe(
      '"say \\"hi\\" \\\\ bye\\n\\t\\r"'
    )
  })

  it("spells controls, bidi and invisible characters as \\u{…}", () => {
    expect(candidString("a\u0007b\u007f")).toBe('"a\\u{7}b\\u{7f}"')
    expect(candidString("pay‮evil")).toBe('"pay\\u{202e}evil"')
    expect(candidString("zero​width﻿")).toBe('"zero\\u{200b}width\\u{feff}"')
    expect(candidString("tag\u{E0041}")).toBe('"tag\\u{e0041}"')
  })

  it("keeps other Unicode as it is", () => {
    expect(candidString("héllo 😀 日本")).toBe('"héllo 😀 日本"')
  })
})

describe("candidText: blobs", () => {
  it("prints readable ASCII as text, as didc does", () => {
    expect(candidText(c.blob(), new TextEncoder().encode("hello"))).toBe(
      'blob "hello"'
    )
    expect(
      candidText(
        c.blob(),
        Uint8Array.from([0x22, 0x27, 0x60, 0x5c, 0x41, 0x0a])
      )
    ).toBe('blob "\\22\\27\\60\\5cA\\0a"')
  })

  it("escapes every byte of binary data", () => {
    expect(candidText(c.blob(), Uint8Array.from([0, 1, 0xab, 0x41]))).toBe(
      'blob "\\00\\01\\ab\\41"'
    )
    expect(candidText(c.blob(), new Uint8Array(0))).toBe('blob ""')
  })
})

describe("candidText: constructed values", () => {
  it("prints opt, parenthesizing an annotated value", () => {
    expect(candidText(c.opt(c.text), null)).toBe("null")
    expect(candidText(c.opt(c.text), "x")).toBe('opt "x"')
    expect(candidText(c.opt(c.nat), 5n)).toBe("opt (5 : nat)")
    expect(candidText(c.opt(c.opt(c.nat8)), { some: 7 })).toBe(
      "opt opt (7 : nat8)"
    )
  })

  it("prints the three states of a boxed opt", () => {
    const boxed = c.opt(c.opt(c.text))
    expect(isBoxedOpt(boxed)).toBe(true)
    expect(candidText(boxed, null)).toBe("null")
    expect(candidText(boxed, { some: null })).toBe("opt null")
    expect(candidText(boxed, { some: "hi" })).toBe('opt opt "hi"')
    expect(candidText(c.opt(c.null), { some: null })).toBe("opt null")
  })

  it("prints vecs, records, tuples and unit", () => {
    expect(candidText(c.vec(c.nat8), [1, 2])).toBe("vec { 1 : nat8; 2 : nat8 }")
    expect(candidText(c.vec(c.text), [])).toBe("vec {}")
    expect(
      candidText(
        c.record({ owner: c.principal, subaccount: c.opt(c.blob()) }),
        {
          owner: ANONYMOUS,
          subaccount: null,
        }
      )
    ).toBe('record { owner = principal "2vxsx-fae"; subaccount = null }')
    expect(candidText(c.tuple([c.text, c.nat]), ["a", 1n])).toBe(
      'record { "a"; 1 : nat }'
    )
    expect(candidText(c.unit(), {})).toBe("record {}")
  })

  it("quotes labels that are keywords or not identifiers, numbers unnamed ones", () => {
    const schema = c.record({
      type: c.text,
      "has space": c.nat8,
      _7_: c.bool,
      true: c.bool,
      plain_name: c.null,
    })
    const value = {
      type: "t",
      "has space": 1,
      _7_: false,
      true: true,
      plain_name: null,
    }
    const text = candidText(schema, value)
    expect(text).toContain('"type" = "t"')
    expect(text).toContain('"has space" = 1 : nat8')
    expect(text).toContain("7 = false")
    expect(text).toContain('"true" = true')
    expect(text).toContain("plain_name = null")
  })

  it("reads a field named __proto__ as an own field", () => {
    const schema = c.record({ ["__proto__"]: c.text })
    const value = {}
    Object.defineProperty(value, "__proto__", {
      value: "own",
      enumerable: true,
      writable: true,
      configurable: true,
    })
    expect(candidText(schema, value)).toBe('record { __proto__ = "own" }')
  })

  it("prints variants with and without payloads", () => {
    const schema = c.variant({ Ok: c.nat, Pending: c.null, _3_: c.null })
    expect(candidText(schema, { tag: "Ok", value: 5n })).toBe(
      "variant { Ok = 5 : nat }"
    )
    expect(candidText(schema, { tag: "Pending" })).toBe("variant { Pending }")
    expect(candidText(schema, { tag: "_3_" })).toBe("variant { 3 }")
  })

  it("prints func and service references", () => {
    const fn = c.func([c.nat], [c.text], "query")
    expect(candidText(fn, { principal: LEDGER, method: "icrc1_name" })).toBe(
      'func "ryjl3-tyaaa-aaaaa-aaaba-cai".icrc1_name'
    )
    expect(candidText(fn, { principal: LEDGER, method: "query" })).toBe(
      'func "ryjl3-tyaaa-aaaaa-aaaba-cai"."query"'
    )
    expect(candidText(c.service({}), LEDGER)).toBe(
      'service "ryjl3-tyaaa-aaaaa-aaaba-cai"'
    )
  })
})

describe("candidText: values that do not fit the schema", () => {
  it("throws a TypeError naming the path", () => {
    const schema = c.record({ to: c.record({ owner: c.principal }) })
    expect(() => candidText(schema, { to: { owner: 5 } })).toThrow(
      /^\$\.to\.owner: expected principal text, got number 5$/
    )
    expect(() => candidText(c.nat, 5)).toThrow(TypeError)
    expect(() => candidText(c.record({ a: c.nat }), {})).toThrow(
      "$.a: missing field"
    )
    expect(() =>
      candidText(c.variant({ A: c.null }), { tag: "toString" })
    ).toThrow(/tag of the variant/)
    expect(() => candidText(c.empty, null)).toThrow(TypeError)
  })
})

describe("candidArgsText", () => {
  it("prints an argument list", () => {
    expect(candidArgsText([], [])).toBe("()")
    expect(candidArgsText([c.nat, c.text], [1n, "x"])).toBe('(1 : nat, "x")')
  })

  it("refuses a count mismatch", () => {
    expect(() => candidArgsText([c.nat], [])).toThrow(
      "1 argument types for 0 values"
    )
  })

  it("prints icrc1_transfer's argument as the exact call", () => {
    const value = {
      to: { owner: ANONYMOUS, subaccount: null },
      fee: null,
      memo: new TextEncoder().encode("rent"),
      from_subaccount: null,
      created_at_time: 1_760_000_000_000_000_000n,
      amount: 150_000_000n,
    }
    expect(encodeArgs([TransferArg], [value]).ok).toBe(true)
    expect(candidArgsText([TransferArg], [value])).toBe(
      '(record { to = record { owner = principal "2vxsx-fae"; subaccount = null }; fee = null; memo = opt blob "rent"; from_subaccount = null; created_at_time = opt (1_760_000_000_000_000_000 : nat64); amount = 150_000_000 : nat })'
    )
  })

  it("breaks groups that do not fit the width onto indented lines", () => {
    const value = {
      to: { owner: ANONYMOUS, subaccount: null },
      fee: 10_000n,
      memo: null,
      from_subaccount: null,
      created_at_time: null,
      amount: 1n,
    }
    expect(candidArgsText([TransferArg], [value], { width: 72 })).toBe(
      [
        "(",
        "  record {",
        '    to = record { owner = principal "2vxsx-fae"; subaccount = null };',
        "    fee = opt (10_000 : nat);",
        "    memo = null;",
        "    from_subaccount = null;",
        "    created_at_time = null;",
        "    amount = 1 : nat",
        "  }",
        ")",
      ].join("\n")
    )
  })
})

// ---------------------------------------------------------------------------
// Every value kind the three generated modules' results contain.
// ---------------------------------------------------------------------------

const MODULES = {
  icrc1: icrc1Actor,
  icp_ledger: icpActor,
  ckbtc_minter: minterActor,
}

function kindOf(schema: AnyFieldSchema): string {
  const node = resolve(schema)
  if (node.kind === "primitive") return node.primitive
  return node.kind === "opt" && isBoxedOpt(node) ? "boxed opt" : node.kind
}

/** Every kind reachable from the schemas (recursion visited once). */
function kindsIn(schemas: readonly AnyFieldSchema[]): Set<string> {
  const kinds = new Set<string>()
  const seen = new Set<object>()
  const walk = (schema: AnyFieldSchema): void => {
    const node = resolve(schema)
    kinds.add(kindOf(schema))
    if (seen.has(node)) return
    seen.add(node)
    if (node.kind === "opt" || node.kind === "vec") walk(node.inner)
    if (node.kind === "record") fieldsOf(node).forEach(([, f]) => walk(f))
    if (node.kind === "tuple") elementsOf(node).forEach(walk)
    if (node.kind === "variant") {
      for (const tag of Object.keys(node.arms)) {
        const arm = armOf(node, tag)
        if (arm !== undefined) walk(arm)
      }
    }
  }
  schemas.forEach(walk)
  return kinds
}

/**
 * A deterministic, non-trivial value: opts present, vecs of one, the
 * `pick`-th arm of each variant (wrapping), so several picks visit every arm.
 * A recursive edge gets the empty value (null, []), as decode would allow.
 */
function sample(
  schema: AnyFieldSchema,
  pick: number,
  active = new Set<object>()
): unknown {
  const node = resolve(schema)
  if (active.has(node)) return node.kind === "vec" ? [] : null
  active.add(node)
  try {
    switch (node.kind) {
      case "primitive":
        return PRIMITIVE_SAMPLES[node.primitive]
      case "blob":
        return Uint8Array.from([0, 1, 0xff])
      case "unit":
        return {}
      case "opt": {
        const inner = sample(node.inner, pick, active)
        return isBoxedOpt(node) ? { some: inner } : inner
      }
      case "vec":
        return [sample(node.inner, pick, active)]
      case "record":
        return Object.fromEntries(
          fieldsOf(node).map(([k, f]) => [k, sample(f, pick, active)])
        )
      case "tuple":
        return elementsOf(node).map((e) => sample(e, pick, active))
      case "variant": {
        const tags = Object.keys(node.arms)
        const tag = tags[pick % tags.length] ?? ""
        const arm = armOf(node, tag)
        if (arm === undefined || isTagOnly(arm)) return { tag }
        return { tag, value: sample(arm, pick, active) }
      }
      case "func":
        return { principal: LEDGER, method: "get_blocks" }
      case "service":
        return LEDGER
    }
  } finally {
    active.delete(node)
  }
}

const PRIMITIVE_SAMPLES: Readonly<Record<string, unknown>> = {
  null: null,
  reserved: null,
  bool: true,
  text: 'say "hi"\n',
  principal: LEDGER,
  nat: 1_234_567n,
  int: -1_234n,
  nat64: 2n ** 64n - 1n,
  int64: -(2n ** 63n),
  nat8: 255,
  nat16: 65_535,
  nat32: 4_294_967_295,
  int8: -128,
  int16: -32_768,
  int32: -2_147_483_648,
  float32: 0.5,
  float64: -1.25,
}

/** What each kind's text looks like with the samples above. */
const KIND_MARKERS: Readonly<Record<string, string | RegExp>> = {
  blob: 'blob "\\00\\01\\ff"',
  func: 'func "ryjl3-tyaaa-aaaaa-aaaba-cai".get_blocks',
  opt: "opt ",
  vec: "vec {",
  record: "record {",
  tuple: 'record { "say \\"hi\\"\\n"; ',
  variant: "variant {",
  bool: "true",
  // null appears as the type of tag-only arms: `variant { TooOld }`.
  null: /variant \{ [A-Za-z][A-Za-z0-9_]* \}/,
  text: '"say \\"hi\\"\\n"',
  principal: 'principal "ryjl3-tyaaa-aaaaa-aaaba-cai"',
  nat: "1_234_567 : nat",
  int: "-1_234 : int",
  nat64: "18_446_744_073_709_551_615 : nat64",
  nat8: "255 : nat8",
  nat32: "4_294_967_295 : nat32",
  int16: "-32_768 : int16",
}

describe("candidArgsText over the generated modules' results", () => {
  const all = Object.values(MODULES).flatMap((actor) => [
    ...serviceMethods(actor as AnySchema).values(),
  ])

  it("finds the kinds the committed .did files use", () => {
    const kinds = kindsIn(all.flatMap((m) => m.results))
    expect([...kinds].sort()).toEqual(Object.keys(KIND_MARKERS).sort())
  })

  it("prints every result of every method, every variant arm visited", () => {
    const texts: string[] = []
    for (const method of all) {
      for (let pick = 0; pick < 12; pick++) {
        const values = method.results.map((r) => sample(r, pick))
        expect(encodeArgs(method.results, values).ok, method.name).toBe(true)
        const text = candidArgsText(method.results, values)
        expect(text.startsWith("(") && text.endsWith(")"), method.name).toBe(
          true
        )
        texts.push(text, candidArgsText(method.results, values, { width: 80 }))
      }
    }
    const joined = texts.join("\n")
    for (const [kind, marker] of Object.entries(KIND_MARKERS)) {
      if (typeof marker === "string") expect(joined, kind).toContain(marker)
      else expect(joined, kind).toMatch(marker)
    }
  })

  it("prints a typical reply of each module exactly", () => {
    const transfer = serviceMethods(icrc1Actor).get("icrc1_transfer")
    const metadata = serviceMethods(icrc1Actor).get("icrc1_metadata")
    const blocks = serviceMethods(icpActor).get("query_blocks")
    const info = serviceMethods(minterActor).get("get_minter_info")
    if (!transfer || !metadata || !blocks || !info) throw new Error("methods")

    expect(
      candidArgsText(transfer.results, [{ tag: "Ok", value: 1_234n }])
    ).toBe("(variant { Ok = 1_234 : nat })")
    expect(
      candidArgsText(transfer.results, [
        {
          tag: "Err",
          value: { tag: "InsufficientFunds", value: { balance: 5n } },
        },
      ])
    ).toBe(
      "(variant { Err = variant { InsufficientFunds = record { balance = 5 : nat } } })"
    )
    expect(
      candidArgsText(metadata.results, [
        [
          ["icrc1:symbol", { tag: "Text", value: "ICP" }],
          ["icrc1:fee", { tag: "Nat", value: 10_000n }],
        ],
      ])
    ).toBe(
      '(vec { record { "icrc1:symbol"; variant { Text = "ICP" } }; record { "icrc1:fee"; variant { Nat = 10_000 : nat } } })'
    )
    expect(
      candidArgsText(blocks.results, [
        {
          certificate: null,
          blocks: [],
          chain_length: 27_000_000n,
          first_block_index: 26_999_000n,
          archived_blocks: [
            {
              callback: {
                principal: principal("qjdve-lqaaa-aaaaa-aaaeq-cai"),
                method: "get_blocks",
              },
              start: 0n,
              length: 2_000n,
            },
          ],
        },
      ])
    ).toBe(
      '(record { certificate = null; blocks = vec {}; chain_length = 27_000_000 : nat64; first_block_index = 26_999_000 : nat64; archived_blocks = vec { record { callback = func "qjdve-lqaaa-aaaaa-aaaeq-cai".get_blocks; start = 0 : nat64; length = 2_000 : nat64 } } })'
    )
    expect(
      candidArgsText(
        info.results,
        [
          {
            retrieve_btc_min_amount: 50_000n,
            deposit_btc_min_amount: null,
            min_confirmations: 4,
            kyt_fee: 100n,
          },
        ],
        { width: 50 }
      )
    ).toBe(
      [
        "(",
        "  record {",
        "    retrieve_btc_min_amount = 50_000 : nat64;",
        "    deposit_btc_min_amount = null;",
        "    min_confirmations = 4 : nat32;",
        "    kyt_fee = 100 : nat64",
        "  }",
        ")",
      ].join("\n")
    )
  })
})
