import { c, isBoxedOpt, principal, type Schema } from "@meantjs/schema"
import { encodeArgs } from "@meantjs/schema/codec"
import { describe, expect, it } from "vitest"
import {
  candidArgsText,
  candidLabel,
  candidName,
  candidString,
  candidText,
} from "./candid-text.ts"

// Ported from canister-studio's values/candid-text.test.ts. Every expected
// text there was also fed to didc 0.5.4 (`didc encode`), which reads it back
// to the same bytes; CI has no didc, so the strings are pinned.

const LEDGER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const ANONYMOUS = principal("2vxsx-fae")

// The ICRC-1 types as a generated module builds them: every declaration a rec.
const Account = c.rec(() =>
  c.record({ owner: c.principal, subaccount: c.opt(c.blob()) })
)
const TransferArg = c.rec(() =>
  c.record({
    to: Account,
    fee: c.opt(c.nat),
    memo: c.opt(c.blob()),
    from_subaccount: c.opt(c.blob()),
    created_at_time: c.opt(c.nat64),
    amount: c.nat,
  })
)

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
    expect(candidText(c.int16, -32_768)).toBe("-32_768 : int16")
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
    expect(candidText(c.float64, Number.POSITIVE_INFINITY)).toBe(
      "inf : float64"
    )
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
    expect(candidString("pay\u202eevil")).toBe('"pay\\u{202e}evil"')
    expect(candidString("zero\u200bwidth\ufeff")).toBe(
      '"zero\\u{200b}width\\u{feff}"'
    )
    expect(candidString("tag\u{E0041}")).toBe('"tag\\u{e0041}"')
    expect(candidString("\u2066isolate\u2069")).toBe(
      '"\\u{2066}isolate\\u{2069}"'
    )
    expect(candidString("line\u2028para\u2029")).toBe(
      '"line\\u{2028}para\\u{2029}"'
    )
    expect(candidString("nel\u0085soft\u00ad")).toBe('"nel\\u{85}soft\\u{ad}"')
  })

  it("spells the characters that can carry hidden data", () => {
    // Variation selectors, the supplement included, are how text smuggles
    // bytes past a reader ("emoji smuggling"); so are tag characters.
    expect(candidString("x\ufe0f")).toBe('"x\\u{fe0f}"')
    expect(candidString("x\u{E0100}\u{E01EF}")).toBe('"x\\u{e0100}\\u{e01ef}"')
    expect(candidString("cgj\u034f")).toBe('"cgj\\u{34f}"')
    expect(candidString("fill\u3164\uffa0\u115f")).toBe(
      '"fill\\u{3164}\\u{ffa0}\\u{115f}"'
    )
    expect(candidString("\u{1BCA0}\u{1D173}")).toBe('"\\u{1bca0}\\u{1d173}"')
  })

  it("spells private use, noncharacters and lone surrogates", () => {
    expect(candidString("\ue000\uf8ff")).toBe('"\\u{e000}\\u{f8ff}"')
    expect(candidString("\u{F0000}\u{10FFFD}")).toBe('"\\u{f0000}\\u{10fffd}"')
    expect(candidString("﷐￾￿\u{1FFFE}")).toBe(
      '"\\u{fdd0}\\u{fffe}\\u{ffff}\\u{1fffe}"'
    )
    expect(candidString("a\ud800b\udc00")).toBe('"a\\u{d800}b\\u{dc00}"')
  })

  it("keeps other Unicode as it is", () => {
    expect(candidString("héllo 😀 日本 ä ﷺ")).toBe('"héllo 😀 日本 ä ﷺ"')
    // A space that is not ASCII is visible as space: kept.
    expect(candidString("a b")).toBe('"a b"')
  })
})

describe("candidName and candidLabel", () => {
  it("leaves identifiers bare and quotes the rest", () => {
    expect(candidName("icrc1_transfer")).toBe("icrc1_transfer")
    expect(candidName("query")).toBe('"query"')
    expect(candidName("has space")).toBe('"has space"')
    expect(candidName("1st")).toBe('"1st"')
    expect(candidName("evil\u202e")).toBe('"evil\\u{202e}"')
  })

  it("prints an unnamed label as its number", () => {
    expect(candidLabel("_7_")).toBe("7")
    expect(candidLabel("_07_")).toBe("_07_")
    expect(candidLabel("type")).toBe('"type"')
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
    expect(candidText(c.opt(c.reserved), { some: 1 })).toBe("opt null")
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

  it("escapes hidden characters wherever a string is quoted", () => {
    const schema = c.record({
      memo: c.text,
      "label\u200b": c.nat8,
      callback: c.func([], [], "query"),
    })
    const value = {
      memo: "to Bob\u202e9999",
      "label\u200b": 1,
      callback: { principal: LEDGER, method: "get\u2066" },
    }
    const text = candidText(schema, value)
    expect(text).toContain('memo = "to Bob\\u{202e}9999"')
    expect(text).toContain('"label\\u{200b}" = 1 : nat8')
    expect(text).toContain('."get\\u{2066}"')
    expect(text).not.toMatch(/[\u200b\u202e\u2066]/)
  })

  it("prints a recursive value", () => {
    type List = { head: bigint; tail: List | null }
    const List: Schema<List> = c.rec(() =>
      c.record({ head: c.nat, tail: c.opt(List) })
    )
    expect(candidText(List, { head: 1n, tail: { head: 2n, tail: null } })).toBe(
      "record { head = 1 : nat; tail = opt record { head = 2 : nat; tail = null } }"
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
    expect(() => candidText(c.variant({ A: c.nat }), { tag: "A" })).toThrow(
      "$.value: missing payload of A"
    )
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

  it("names the argument in a path", () => {
    expect(() => candidArgsText([c.nat, c.nat], [1n, "2"])).toThrow(
      /^\$args\[1\]: expected a bigint \(nat\)/
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

  it("prints a typical reply of a ledger exactly", () => {
    const TransferError = c.rec(() =>
      c.variant({
        GenericError: c.record({ message: c.text, error_code: c.nat }),
        TemporarilyUnavailable: c.null,
        InsufficientFunds: c.record({ balance: c.nat }),
        TooOld: c.null,
      })
    )
    const TransferResult = c.rec(() =>
      c.variant({ Ok: c.nat, Err: TransferError })
    )
    const Value = c.rec(() =>
      c.variant({ Int: c.int, Nat: c.nat, Blob: c.blob(), Text: c.text })
    )
    expect(
      candidArgsText([TransferResult], [{ tag: "Ok", value: 1_234n }])
    ).toBe("(variant { Ok = 1_234 : nat })")
    expect(
      candidArgsText(
        [TransferResult],
        [
          {
            tag: "Err",
            value: { tag: "InsufficientFunds", value: { balance: 5n } },
          },
        ]
      )
    ).toBe(
      "(variant { Err = variant { InsufficientFunds = record { balance = 5 : nat } } })"
    )
    expect(
      candidArgsText(
        [c.vec(c.tuple([c.text, Value]))],
        [
          [
            ["icrc1:symbol", { tag: "Text", value: "ICP" }],
            ["icrc1:fee", { tag: "Nat", value: 10_000n }],
          ],
        ]
      )
    ).toBe(
      '(vec { record { "icrc1:symbol"; variant { Text = "ICP" } }; record { "icrc1:fee"; variant { Nat = 10_000 : nat } } })'
    )
    const MinterInfo = c.rec(() =>
      c.record({
        retrieve_btc_min_amount: c.nat64,
        deposit_btc_min_amount: c.opt(c.nat64),
        min_confirmations: c.nat32,
        kyt_fee: c.nat64,
      })
    )
    expect(
      candidArgsText(
        [MinterInfo],
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
