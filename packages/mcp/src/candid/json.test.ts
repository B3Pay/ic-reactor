import { c, principal, type AnyFieldSchema, type Schema } from "@meantjs/schema"
import { encode } from "@meantjs/schema/codec"
import { validate } from "@meantjs/schema/validate"
import { describe, expect, it, vi } from "vitest"
import {
  INPUT_LIMITS,
  argsFromInput,
  methodInput,
  resultArms,
  valueFromJson,
  valueToJson,
  type InputIssue,
} from "./json.ts"

// validate() wrapped so one test can make it refuse; it is the real one
// everywhere else.
vi.mock("@meantjs/schema/validate", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@meantjs/schema/validate")>()
  return { ...original, validate: vi.fn(original.validate) }
})

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

type List = { head: bigint; tail: List | null }
const List: Schema<List> = c.rec(() =>
  c.record({ head: c.nat, tail: c.opt(List) })
)

/** The value, or the issues as a readable failure. */
function read(schema: AnyFieldSchema, json: unknown): unknown {
  const result = valueFromJson(schema, json)
  if (!result.ok) {
    throw new Error(`unexpected issues: ${JSON.stringify(result.issues)}`)
  }
  return result.value
}

/** The issues of a refused read. */
function refused(schema: AnyFieldSchema, json: unknown): InputIssue[] {
  const result = valueFromJson(schema, json)
  if (result.ok) {
    throw new Error(`expected issues, read ${String(result.value)}`)
  }
  return result.issues
}

/** The one issue of a refused read. */
function refusal(schema: AnyFieldSchema, json: unknown): InputIssue {
  const issues = refused(schema, json)
  expect(issues).toHaveLength(1)
  return issues[0] as InputIssue
}

function bytesOf(schema: AnyFieldSchema, value: unknown): Uint8Array {
  const encoded = encode(schema as Schema<unknown>, value)
  if (!encoded.ok) throw new Error(JSON.stringify(encoded.issues))
  return encoded.bytes
}

/** JSON as the model sends it: text, parsed. */
function wire(json: unknown): unknown {
  return JSON.parse(JSON.stringify(json))
}

describe("valueFromJson: bool, null, reserved, empty, text", () => {
  it("reads bool and null exactly", () => {
    expect(read(c.bool, true)).toBe(true)
    expect(read(c.bool, false)).toBe(false)
    expect(read(c.null, null)).toBe(null)
    expect(refusal(c.bool, "true")).toEqual({
      path: "$",
      message: 'expected true or false (bool), got the string "true"',
    })
    expect(refusal(c.null, 0).message).toBe("expected null, got the number 0")
  })

  it("reads anything as reserved, giving null", () => {
    expect(read(c.reserved, { any: ["thing"] })).toBe(null)
    expect(read(c.reserved, "x")).toBe(null)
    expect(read(c.reserved, null)).toBe(null)
  })

  it("refuses every value of empty", () => {
    expect(refusal(c.empty, null).message).toBe(
      "nothing can be sent here: the type is empty, which has no values"
    )
  })

  it("reads text and refuses a lone surrogate", () => {
    expect(read(c.text, "héllo 😀")).toBe("héllo 😀")
    expect(read(c.text, "")).toBe("")
    expect(refusal(c.text, "ab\ud800c")).toEqual({
      path: "$",
      message:
        "the text has a lone surrogate (\\ud800 at index 2); Candid text is Unicode characters only",
    })
    expect(refusal(c.text, "\udc00").message).toContain("\\udc00 at index 0")
    expect(refusal(c.text, 5).message).toBe(
      "expected a string (text), got the number 5"
    )
  })
})

describe("valueFromJson: integers", () => {
  it("reads nat8..int32 from a number or a decimal string", () => {
    expect(read(c.nat8, 255)).toBe(255)
    expect(read(c.nat8, "255")).toBe(255)
    expect(read(c.nat8, " 7 ")).toBe(7)
    expect(read(c.int8, -128)).toBe(-128)
    expect(read(c.int8, "-128")).toBe(-128)
    expect(read(c.nat16, 65_535)).toBe(65_535)
    expect(read(c.int16, "-32768")).toBe(-32_768)
    expect(read(c.nat32, 4_294_967_295)).toBe(4_294_967_295)
    expect(read(c.int32, "2147483647")).toBe(2_147_483_647)
    expect(read(c.nat8, 1.0)).toBe(1)
    expect(Object.is(read(c.nat8, -0), 0)).toBe(true)
    expect(Object.is(read(c.int8, "-0"), 0)).toBe(true)
  })

  it("refuses fixed-width integers out of range or not integers", () => {
    expect(refusal(c.nat8, 256)).toEqual({
      path: "$",
      message: "nat8 is an integer from 0 to 255, got 256",
    })
    expect(refusal(c.nat8, -1).message).toBe(
      "nat8 is an integer from 0 to 255, got -1"
    )
    expect(refusal(c.int8, "-129").message).toBe(
      "int8 is an integer from -128 to 127, got -129"
    )
    expect(refusal(c.nat32, 4_294_967_296).message).toContain("0 to 4294967295")
    expect(refusal(c.int32, 2_147_483_648).message).toContain(
      "-2147483648 to 2147483647"
    )
    expect(refusal(c.nat16, 1.5).message).toBe(
      "nat16 is an integer from 0 to 65535, got 1.5"
    )
    for (const bad of ["1.5", "+1", "1e2", "", "0x10", "1 000", true, null]) {
      expect(refusal(c.nat8, bad).message).toMatch(
        /^expected nat8, an integer from 0 to 255, got /
      )
    }
  })

  it("reads nat, int, nat64, int64 from a decimal string or a safe integer", () => {
    expect(read(c.nat, "150000000")).toBe(150_000_000n)
    expect(read(c.nat, " 42 ")).toBe(42n)
    expect(read(c.nat, 5)).toBe(5n)
    expect(read(c.nat, Number.MAX_SAFE_INTEGER)).toBe(9_007_199_254_740_991n)
    expect(read(c.nat, "123456789012345678901234567890")).toBe(
      123_456_789_012_345_678_901_234_567_890n
    )
    expect(read(c.int, "-42")).toBe(-42n)
    expect(read(c.int, -42)).toBe(-42n)
    expect(read(c.nat64, "18446744073709551615")).toBe(2n ** 64n - 1n)
    expect(read(c.int64, "-9223372036854775808")).toBe(-(2n ** 63n))
    expect(read(c.int64, "9223372036854775807")).toBe(2n ** 63n - 1n)
    expect(read(c.nat, "007")).toBe(7n)
  })

  it("refuses a JSON number past 2^53, which has lost digits", () => {
    for (const unsafe of [2 ** 53, 1e20, -(2 ** 60)]) {
      const issue = refusal(c.int, unsafe)
      expect(issue.path).toBe("$")
      expect(issue.message).toBe(
        "int needs the exact digits as a decimal string: a JSON number this large (past 2^53) has already lost digits, so write the value in quotes"
      )
    }
    expect(refusal(c.nat64, 1.5).message).toBe("nat64 is an integer, got 1.5")
  })

  it("refuses big integers out of range", () => {
    expect(refusal(c.nat, "-1").message).toBe("nat is 0 or more, got -1")
    expect(refusal(c.nat64, "18446744073709551616").message).toBe(
      "nat64 is 0 to 18446744073709551615, got 18446744073709551616"
    )
    expect(refusal(c.nat64, -1).message).toContain("nat64 is 0 to")
    expect(refusal(c.int64, "9223372036854775808").message).toBe(
      "int64 is -9223372036854775808 to 9223372036854775807, got 9223372036854775808"
    )
    expect(refusal(c.int64, "-9223372036854775809").message).toContain(
      "int64 is"
    )
  })

  it("refuses text that is not a plain decimal", () => {
    for (const bad of [
      "1.5",
      "+5",
      "1e3",
      "",
      "0x10",
      "1_000",
      "1,000",
      "five",
    ]) {
      expect(refusal(c.nat, bad).message).toMatch(
        /^expected nat as a decimal string \(0 or more\), such as "150000000", got the string /
      )
    }
    expect(refusal(c.nat64, true).message).toBe(
      'expected nat64 as a decimal string (0 to 18446744073709551615), such as "150000000", got true'
    )
    expect(refusal(c.nat, { value: "1" }).message).toContain("got an object")
  })

  it("refuses a decimal string longer than the digit bound", () => {
    expect(read(c.nat, "9".repeat(INPUT_LIMITS.maxDigits))).toBe(
      10n ** BigInt(INPUT_LIMITS.maxDigits) - 1n
    )
    expect(refusal(c.nat, "9".repeat(INPUT_LIMITS.maxDigits + 1)).message).toBe(
      "this number has more than 10000 digits"
    )
  })
})

describe("valueFromJson: floats", () => {
  it("reads numbers and the four words", () => {
    expect(read(c.float64, 1.5)).toBe(1.5)
    expect(read(c.float64, -1e300)).toBe(-1e300)
    expect(read(c.float64, "NaN")).toBeNaN()
    expect(read(c.float64, "Infinity")).toBe(Infinity)
    expect(read(c.float64, " -Infinity ")).toBe(-Infinity)
    expect(Object.is(read(c.float64, "-0"), -0)).toBe(true)
    expect(Object.is(read(c.float64, -0), -0)).toBe(true)
    expect(read(c.float32, 0.5)).toBe(0.5)
    expect(read(c.float32, Math.fround(0.1))).toBe(Math.fround(0.1))
    expect(read(c.float32, "NaN")).toBeNaN()
    expect(read(c.float32, "-Infinity")).toBe(-Infinity)
  })

  it("refuses other strings and other types", () => {
    expect(refusal(c.float64, "1.5").message).toBe(
      'expected float64 as a JSON number (or "NaN", "Infinity", "-Infinity", "-0"), got the string "1.5"'
    )
    expect(refusal(c.float64, "inf").path).toBe("$")
    expect(refusal(c.float32, null).message).toContain("float32")
  })

  it("refuses a float32 that 32 bits do not hold, naming the nearest", () => {
    expect(refusal(c.float32, 0.1).message).toBe(
      "float32 cannot hold 0.1 exactly; the nearest float32 value is 0.10000000149011612"
    )
    expect(refusal(c.float32, 1e39).message).toBe(
      "1e+39 is past the range of float32 (±3.4028234663852886e+38)"
    )
  })
})

describe("valueFromJson: principals", () => {
  it("reads canonical text, trimmed and in any case", () => {
    expect(read(c.principal, "ryjl3-tyaaa-aaaaa-aaaba-cai")).toBe(LEDGER)
    expect(read(c.principal, "  RYJL3-TYAAA-AAAAA-AAABA-CAI\n")).toBe(LEDGER)
    expect(read(c.principal, "aaaaa-aa")).toBe("aaaaa-aa")
    expect(read(c.service({}), "2VXSX-FAE")).toBe(ANONYMOUS)
  })

  it("says what is wrong with text that is not a principal", () => {
    expect(refusal(c.principal, "ryjl3-tyaaa-aaaaa-aaaba-caj")).toEqual({
      path: "$",
      message:
        '"ryjl3-tyaaa-aaaaa-aaaba-caj" is not a valid principal: its grouping or checksum is wrong (a typo?)',
    })
    expect(refusal(c.principal, "ryjl3tyaaaaaaaaaaabacai").message).toContain(
      "grouping or checksum"
    )
    expect(refusal(c.principal, "alice.icp").message).toBe(
      '"alice.icp" is not principal text, which has only the letters a-z, the digits 2-7 and dashes, such as "ryjl3-tyaaa-aaaaa-aaaba-cai"'
    )
    const accountId =
      "1c7a48ba6a562aa9eaa2481a9049cdf0433b9738c992d698c31d8abf89cadc79"
    expect(refusal(c.principal, accountId).message).toContain(
      "looks like an account identifier (64 hex digits), not a principal"
    )
    expect(refusal(c.principal, 5).message).toBe(
      'expected a principal as principal text such as "ryjl3-tyaaa-aaaaa-aaaba-cai", got the number 5'
    )
    expect(refusal(c.service({}), "nope!").message).toContain(
      "is not principal text"
    )
  })
})

describe("valueFromJson: blobs", () => {
  it("reads hex in either case, with or without 0x", () => {
    expect(read(c.blob(), "00ff")).toEqual(Uint8Array.from([0, 255]))
    expect(read(c.blob(), "00FFaB")).toEqual(Uint8Array.from([0, 255, 0xab]))
    expect(read(c.blob(), "0x0a")).toEqual(Uint8Array.from([10]))
    expect(read(c.blob(), "")).toEqual(new Uint8Array(0))
  })

  it("reads { utf8 } as the UTF-8 bytes of the text", () => {
    expect(read(c.blob(), { utf8: "hi é" })).toEqual(
      Uint8Array.from([0x68, 0x69, 0x20, 0xc3, 0xa9])
    )
    expect(read(c.blob(), { utf8: "" })).toEqual(new Uint8Array(0))
  })

  it("refuses odd or non-hex text and a malformed { utf8 }", () => {
    expect(refusal(c.blob(), "abc").message).toBe(
      'expected a blob as hex (an even number of hex digits, such as "00ff") or as { "utf8": text }, got the string "abc"'
    )
    expect(refusal(c.blob(), "zz").path).toBe("$")
    expect(refusal(c.blob(), "ab cd").path).toBe("$")
    expect(refusal(c.blob(), [1, 2]).message).toBe(
      'expected a blob as hex such as "00ff", or as { "utf8": text }, got an array of 2'
    )
    expect(refusal(c.blob(), { utf8: 5 })).toEqual({
      path: "$.utf8",
      message: "expected a string, got the number 5",
    })
    expect(refusal(c.blob(), { utf8: "a\ud800" }).path).toBe("$.utf8")
    expect(refusal(c.blob(), { utf8: "a", hex: "00" })).toEqual({
      path: "$.hex",
      message:
        'unknown key: a blob written as text is exactly { "utf8": text }',
    })
    expect(refusal(c.blob(), { text: "a" }).path).toBe("$")
  })
})

describe("valueFromJson: opt", () => {
  it("reads null or the value", () => {
    expect(read(c.opt(c.nat), null)).toBe(null)
    expect(read(c.opt(c.nat), "5")).toBe(5n)
    expect(read(c.opt(Account), { owner: "aaaaa-aa" })).toEqual({
      owner: "aaaaa-aa",
      subaccount: null,
    })
  })

  it("reads the three states of a boxed opt", () => {
    const boxed = c.opt(c.opt(c.nat))
    expect(read(boxed, null)).toBe(null)
    expect(read(boxed, { some: null })).toEqual({ some: null })
    expect(read(boxed, { some: "5" })).toEqual({ some: 5n })
    expect(read(c.opt(c.null), { some: null })).toEqual({ some: null })
    expect(read(c.opt(c.reserved), { some: { any: 1 } })).toEqual({
      some: null,
    })
  })

  it("refuses an unboxed value where the opt is boxed", () => {
    const boxed = c.opt(c.opt(c.nat))
    expect(refusal(boxed, "5")).toEqual({
      path: "$",
      message:
        'expected null or { "some": … }: this opt\'s value can itself be null, so a present value is boxed, got the string "5"',
    })
    expect(refusal(boxed, { some: "x" }).path).toBe("$.some")
    expect(refusal(boxed, { some: "5", other: 1 })).toEqual({
      path: "$.other",
      message: 'unknown key: a present value is exactly { "some": value }',
    })
  })

  it("says to drop { some } where the opt is not boxed", () => {
    expect(refusal(c.opt(c.nat), { some: "5" })).toEqual({
      path: "$",
      message:
        'write the value itself (or null for none), without { "some": … }: this opt is not boxed',
    })
    // A record with a field named some is read as the record.
    expect(read(c.opt(c.record({ some: c.nat })), { some: "5" })).toEqual({
      some: 5n,
    })
  })

  it("reads opt empty as null only", () => {
    expect(read(c.opt(c.empty), null)).toBe(null)
    expect(refusal(c.opt(c.empty), 1).message).toContain("no values")
  })
})

describe("valueFromJson: vec and tuple", () => {
  it("reads arrays element by element", () => {
    expect(read(c.vec(c.nat), ["1", 2])).toEqual([1n, 2n])
    expect(read(c.vec(c.text), [])).toEqual([])
    expect(read(c.vec(c.nat8), [1, "2"])).toEqual([1, 2])
    expect(read(c.tuple([c.text, c.nat]), ["a", "1"])).toEqual(["a", 1n])
  })

  it("names the element in a refusal", () => {
    expect(refusal(c.vec(c.nat), ["1", "x"]).path).toBe("$[1]")
    expect(refusal(c.vec(c.vec(c.nat)), [[], ["1", true]]).path).toBe("$[1][1]")
    expect(refusal(c.tuple([c.text, c.nat]), ["a", "b"]).path).toBe("$[1]")
    expect(refusal(c.vec(c.nat), "1").message).toBe(
      'expected an array (vec nat), got the string "1"'
    )
  })

  it("refuses a tuple of the wrong length", () => {
    expect(refusal(c.tuple([c.text, c.nat]), ["a"])).toEqual({
      path: "$",
      message:
        "expected an array of exactly 2 values (a tuple), got an array of 1",
    })
    expect(refusal(c.tuple([c.text]), { 0: "a" }).path).toBe("$")
  })
})

describe("valueFromJson: records", () => {
  it("reads every field, an opt field left out as null", () => {
    expect(
      read(TransferArg, {
        to: { owner: "2vxsx-fae" },
        amount: "150000000",
        memo: { utf8: "rent" },
      })
    ).toEqual({
      to: { owner: ANONYMOUS, subaccount: null },
      fee: null,
      memo: new TextEncoder().encode("rent"),
      from_subaccount: null,
      created_at_time: null,
      amount: 150_000_000n,
    })
  })

  it("refuses a missing field and names unknown ones", () => {
    const issues = refused(TransferArg, {
      to: { owner: "2vxsx-fae", sub_account: "00" },
      Amount: "5",
    })
    expect(issues).toEqual([
      {
        path: "$.to.sub_account",
        message:
          'unknown key (did you mean "subaccount"?); the fields are "owner", "subaccount"',
      },
      { path: "$.amount", message: "missing field (nat)" },
      {
        path: "$.Amount",
        message:
          'unknown key (did you mean "amount"?); the fields are "to", "fee", "memo", "from_subaccount", "created_at_time", "amount"',
      },
    ])
    expect(refusal(Account, { owner: "2vxsx-fae", x: 1 }).message).toBe(
      'unknown key; the fields are "owner", "subaccount"'
    )
    expect(refusal(c.record({ to: Account }), {}).message).toBe(
      "missing field (record { owner : principal; subaccount : opt blob })"
    )
  })

  it("names the field in the path of a deeper refusal", () => {
    expect(
      refusal(TransferArg, { to: { owner: "nope!" }, amount: "1" }).path
    ).toBe("$.to.owner")
    const schema = c.record({ "a b": c.nat, _0_: c.text })
    expect(refusal(schema, { "a b": "x", _0_: "t" }).path).toBe('$["a b"]')
    expect(refusal(schema, { "a b": "1", _0_: 5 }).path).toBe("$._0_")
  })

  it("reads fields named __proto__ and toString as own fields", () => {
    const schema = c.record({ ["__proto__"]: c.text, toString: c.nat8 })
    const json = JSON.parse('{"__proto__": "own", "toString": 1}') as unknown
    const value = read(schema, json) as Record<string, unknown>
    expect(Object.hasOwn(value, "__proto__")).toBe(true)
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect(value["__proto__"]).toBe("own")
    expect(value.toString).toBe(1)
    expect(validate(schema, value).ok).toBe(true)
    // An inherited toString is not the field.
    expect(refusal(schema, JSON.parse('{"__proto__": "own"}')).path).toBe(
      "$.toString"
    )
  })

  it("refuses what is not an object", () => {
    expect(refusal(Account, ["2vxsx-fae", null]).message).toBe(
      'expected an object with the fields "owner", "subaccount", got an array of 2'
    )
    expect(refusal(Account, null).path).toBe("$")
  })

  it("reads unit as {} only", () => {
    expect(read(c.unit(), {})).toEqual({})
    expect(refusal(c.unit(), { a: 1 })).toEqual({
      path: "$.a",
      message: "unknown key: this is the empty record, written {}",
    })
    expect(refusal(c.unit(), null).message).toBe(
      "expected {} (the empty record), got null"
    )
  })
})

describe("valueFromJson: variants", () => {
  const Status = c.variant({
    Ok: c.nat,
    Pending: c.null,
    Later: c.opt(c.nat),
    Never: c.empty,
  })

  it("reads { tag, value } and the forms of a payload-less arm", () => {
    expect(read(Status, { tag: "Ok", value: "5" })).toEqual({
      tag: "Ok",
      value: 5n,
    })
    expect(read(Status, { tag: "Pending" })).toEqual({ tag: "Pending" })
    expect(read(Status, { tag: "Pending", value: null })).toEqual({
      tag: "Pending",
    })
    expect(read(Status, "Pending")).toEqual({ tag: "Pending" })
    expect(read(Status, { tag: "Later", value: null })).toEqual({
      tag: "Later",
      value: null,
    })
    expect(read(Status, { tag: "Later", value: "1" })).toEqual({
      tag: "Later",
      value: 1n,
    })
  })

  it("refuses an unknown arm, listing the arms", () => {
    expect(refusal(Status, { tag: "ok", value: "5" })).toEqual({
      path: "$.tag",
      message:
        'unknown arm "ok" (did you mean "Ok"?); the arms are "Ok", "Pending", "Later", "Never"',
    })
    expect(refusal(Status, "Done").path).toBe("$")
    expect(refusal(Status, { tag: "toString" }).message).toContain(
      'unknown arm "toString"'
    )
    const wide = c.variant(
      Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`Arm${i}`, c.null])
      )
    )
    expect(refusal(wide, "Nope").message).toMatch(
      /^unknown arm "Nope"; the arms are "Arm0", .*"Arm19" and 10 more$/
    )
  })

  it("refuses a missing or extra value", () => {
    expect(refusal(Status, { tag: "Ok" })).toEqual({
      path: "$.value",
      message: 'missing value: the arm "Ok" carries nat',
    })
    // An opt payload is still required: null says none.
    expect(refusal(Status, { tag: "Later" }).path).toBe("$.value")
    expect(refusal(Status, { tag: "Pending", value: 1 })).toEqual({
      path: "$.value",
      message: 'the arm "Pending" carries no value: leave "value" out',
    })
    expect(refusal(Status, "Ok").message).toBe(
      'the arm "Ok" carries a value: write { "tag": "Ok", "value": … }'
    )
    expect(refusal(Status, { tag: "Ok", value: "1", why: 1 }).path).toBe(
      "$.why"
    )
    expect(refusal(Status, { tag: "Never", value: null }).path).toBe("$.value")
  })

  it("says how to write a variant given as { arm: payload }", () => {
    expect(refusal(Status, { Ok: "5" })).toEqual({
      path: "$",
      message: 'write { "tag": "Ok", "value": … }, not { "Ok": … }',
    })
    expect(refusal(Status, { value: 5 })).toEqual({
      path: "$.tag",
      message:
        'missing tag: a variant is { "tag": arm, "value": payload }, the arms being "Ok", "Pending", "Later", "Never"',
    })
    expect(refusal(Status, { tag: 1 }).message).toBe(
      "expected the arm's name as a string, got the number 1"
    )
    expect(refusal(Status, 5).path).toBe("$")
  })

  it("names the payload in the path of a deeper refusal", () => {
    const Nested = c.variant({
      Err: c.variant({ Bad: c.record({ fee: c.nat }) }),
    })
    expect(
      refusal(Nested, {
        tag: "Err",
        value: { tag: "Bad", value: { fee: "x" } },
      }).path
    ).toBe("$.value.value.fee")
  })

  it("reads an arm named __proto__", () => {
    const schema = c.variant({ ["__proto__"]: c.nat, plain: c.null })
    expect(read(schema, { tag: "__proto__", value: "1" })).toEqual({
      tag: "__proto__",
      value: 1n,
    })
  })
})

describe("valueFromJson: func and service references", () => {
  const Callback = c.func([c.nat], [c.text], "query")

  it("reads { principal, method }", () => {
    expect(
      read(Callback, {
        principal: "RYJL3-TYAAA-AAAAA-AAABA-CAI",
        method: "get",
      })
    ).toEqual({ principal: LEDGER, method: "get" })
  })

  it("refuses a malformed reference, naming the part", () => {
    expect(refusal(Callback, { principal: LEDGER })).toEqual({
      path: "$.method",
      message: "missing the method's name",
    })
    expect(refusal(Callback, { principal: LEDGER, method: "" }).message).toBe(
      'expected the method\'s name as a non-empty string, got the string ""'
    )
    expect(refusal(Callback, { principal: "x", method: "get" }).path).toBe(
      "$.principal"
    )
    expect(refusal(Callback, { method: "get" }).path).toBe("$.principal")
    expect(
      refusal(Callback, { principal: LEDGER, method: "get", extra: 1 }).path
    ).toBe("$.extra")
    expect(
      refusal(Callback, { principal: LEDGER, method: "g\udc00" }).path
    ).toBe("$.method")
    expect(refusal(Callback, "get").path).toBe("$")
  })
})

describe("valueFromJson: bounds", () => {
  type Nest = Nest[]
  const Nest: Schema<Nest> = c.rec(() => c.vec(Nest))

  /** Arrays nested `levels` deep: the innermost at depth levels - 1. */
  function nested(levels: number): unknown {
    let json: unknown = []
    for (let i = 1; i < levels; i++) json = [json]
    return json
  }

  it("reads input 64 levels deep and refuses one level more", () => {
    expect(read(Nest, nested(INPUT_LIMITS.maxDepth + 1))).toBeDefined()
    const issue = refusal(Nest, nested(INPUT_LIMITS.maxDepth + 2))
    expect(issue.message).toBe("the input is nested deeper than 64 levels here")
    expect(issue.path).toBe(`$${"[0]".repeat(INPUT_LIMITS.maxDepth + 1)}`)
  })

  it("refuses very deep input without overflowing the stack", () => {
    const issue = refusal(Nest, nested(200_000))
    expect(issue.message).toContain("deeper than 64 levels")
  })

  it("refuses more than 100,000 values in one input", () => {
    const row = Array.from({ length: INPUT_LIMITS.maxVecLength }, () => 1)
    const json = Array.from({ length: 10 }, () => row)
    // 1 + 10 + 100,000 values: the last row passes the bound.
    const issue = refusal(c.vec(c.vec(c.nat8)), json)
    expect(issue.message).toBe(
      "the input holds more than 100000 values; send less in one call"
    )
    expect(issue.path).toBe("$[9][9989]")
    expect(read(c.vec(c.vec(c.nat8)), json.slice(0, 9))).toHaveLength(9)
  })

  it("refuses a vec of more than 10,000 elements", () => {
    const json = Array.from({ length: INPUT_LIMITS.maxVecLength + 1 }, () => 0)
    expect(refusal(c.vec(c.nat8), json)).toEqual({
      path: "$",
      message: "a vec here holds at most 10000 elements, got 10001",
    })
  })

  it("stops after 20 issues", () => {
    const json = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`k${i}`, i])
    )
    expect(refused(c.record({ a: c.opt(c.nat) }), json)).toHaveLength(
      INPUT_LIMITS.maxIssues
    )
  })

  it("roots issues at the path it is given", () => {
    const result = valueFromJson(Account, { owner: 1 }, "$.arg2")
    expect(result.ok || result.issues[0]?.path).toBe("$.arg2.owner")
  })

  it("turns a schema it cannot read into an issue", () => {
    const broken = { kind: "nonsense" } as unknown as AnyFieldSchema
    expect(refusal(broken, 1).message).toBe(
      'the method\'s Candid type could not be read: unknown schema kind "nonsense"'
    )
  })
})

describe("valueToJson", () => {
  it("writes each kind canonically", () => {
    expect(valueToJson(c.null, null)).toBe(null)
    expect(valueToJson(c.reserved, { any: 1 })).toBe(null)
    expect(valueToJson(c.bool, true)).toBe(true)
    expect(valueToJson(c.text, "hi")).toBe("hi")
    expect(valueToJson(c.nat8, 255)).toBe(255)
    expect(Object.is(valueToJson(c.int8, -0), 0)).toBe(true)
    expect(valueToJson(c.nat, 150_000_000n)).toBe("150000000")
    expect(valueToJson(c.int, -5n)).toBe("-5")
    expect(valueToJson(c.nat64, 2n ** 64n - 1n)).toBe("18446744073709551615")
    expect(valueToJson(c.float64, 1.5)).toBe(1.5)
    expect(valueToJson(c.float64, Number.NaN)).toBe("NaN")
    expect(valueToJson(c.float64, Infinity)).toBe("Infinity")
    expect(valueToJson(c.float32, -Infinity)).toBe("-Infinity")
    expect(valueToJson(c.float64, -0)).toBe("-0")
    expect(valueToJson(c.principal, LEDGER)).toBe(LEDGER)
    expect(valueToJson(c.blob(), Uint8Array.from([0, 0xab, 255]))).toBe(
      "00abff"
    )
    expect(valueToJson(c.blob(), new Uint8Array(0))).toBe("")
    expect(valueToJson(c.unit(), {})).toEqual({})
    expect(valueToJson(c.service({}), LEDGER)).toBe(LEDGER)
    expect(
      valueToJson(c.func([], [], "query"), { principal: LEDGER, method: "m" })
    ).toEqual({ principal: LEDGER, method: "m" })
  })

  it("writes opts, boxed or not", () => {
    expect(valueToJson(c.opt(c.nat), null)).toBe(null)
    expect(valueToJson(c.opt(c.nat), 5n)).toBe("5")
    const boxed = c.opt(c.opt(c.nat))
    expect(valueToJson(boxed, null)).toBe(null)
    expect(valueToJson(boxed, { some: null })).toEqual({ some: null })
    expect(valueToJson(boxed, { some: 5n })).toEqual({ some: "5" })
  })

  it("writes records with every field, variants as { tag, value }", () => {
    expect(
      valueToJson(TransferArg, {
        to: { owner: ANONYMOUS, subaccount: null },
        fee: null,
        memo: new TextEncoder().encode("rent"),
        from_subaccount: null,
        created_at_time: 1_760_000_000_000_000_000n,
        amount: 150_000_000n,
      })
    ).toEqual({
      to: { owner: "2vxsx-fae", subaccount: null },
      fee: null,
      memo: "72656e74",
      from_subaccount: null,
      created_at_time: "1760000000000000000",
      amount: "150000000",
    })
    const Result = c.variant({ Ok: c.nat, Err: c.variant({ TooOld: c.null }) })
    expect(valueToJson(Result, { tag: "Ok", value: 5n })).toEqual({
      tag: "Ok",
      value: "5",
    })
    expect(
      valueToJson(Result, { tag: "Err", value: { tag: "TooOld" } })
    ).toEqual({ tag: "Err", value: { tag: "TooOld" } })
    expect(valueToJson(c.tuple([c.text, c.nat]), ["a", 1n])).toEqual(["a", "1"])
    expect(valueToJson(c.vec(c.int), [1n, -1n])).toEqual(["1", "-1"])
  })

  it("writes a field named __proto__ as an own key", () => {
    const schema = c.record({ ["__proto__"]: c.nat })
    const value = {}
    Object.defineProperty(value, "__proto__", {
      value: 1n,
      enumerable: true,
      writable: true,
      configurable: true,
    })
    const json = valueToJson(schema, value)
    expect(JSON.stringify(json)).toBe('{"__proto__":"1"}')
  })

  it("never throws on a value the schema does not describe", () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const hostile = {}
    Object.defineProperty(hostile, "x", {
      enumerable: true,
      get() {
        throw new Error("no")
      },
    })
    const cases: [AnyFieldSchema, unknown][] = [
      [c.nat, "abc"],
      [c.nat, 5],
      [c.record({ a: c.nat }), 5],
      [c.record({ a: c.nat }), cycle],
      [c.variant({ A: c.nat }), { tag: "B", value: 1n }],
      [c.blob(), [1, 2]],
      [c.vec(c.nat), cycle],
      [c.opt(c.opt(c.nat)), 5n],
      [c.text, Symbol("s")],
      [c.record({ x: c.nat }), hostile],
      [c.func([], [], "query"), null],
      [{ kind: "nonsense" } as unknown as AnyFieldSchema, { a: 1n }],
    ]
    for (const [schema, value] of cases) {
      const json = valueToJson(schema, value)
      expect(() => JSON.stringify(json)).not.toThrow()
    }
    expect(valueToJson(c.nat, "abc")).toBe("abc")
    expect(valueToJson(c.blob(), [1, 2])).toEqual([1, 2])
    expect(valueToJson(c.record({ x: c.nat }), hostile)).toBe(null)
  })
})

describe("the round trip", () => {
  type Tree =
    | { tag: "leaf"; value: bigint }
    | { tag: "node"; value: { left: Tree; right: Tree } }
  const Tree: Schema<Tree> = c.rec(() =>
    c.variant({ leaf: c.int, node: c.record({ left: Tree, right: Tree }) })
  )
  const TransferError = c.rec(() =>
    c.variant({
      BadFee: c.record({ expected_fee: c.nat }),
      TooOld: c.null,
      GenericError: c.record({ error_code: c.nat, message: c.text }),
    })
  )
  const TransferResult = c.rec(() =>
    c.variant({ Ok: c.nat, Err: TransferError })
  )
  const Weird = c.rec(() =>
    c.record({
      ["__proto__"]: c.text,
      toString: c.nat8,
      "a b": c.bool,
      _0_: c.opt(c.opt(c.text)),
      _7_: c.tuple([c.float32, c.float64, c.int16]),
      nothing: c.opt(c.null),
      anything: c.reserved,
      unit: c.unit(),
      callback: c.func([c.nat], [], "query"),
      ledger: c.service({}),
    })
  )
  const weird = (proto: string): Record<string, unknown> => {
    const value: Record<string, unknown> = {
      toString: 255,
      "a b": true,
      _0_: { some: null },
      _7_: [Math.fround(0.1), -0, -32_768],
      nothing: { some: null },
      anything: null,
      unit: {},
      callback: { principal: LEDGER, method: "get" },
      ledger: ANONYMOUS,
    }
    Object.defineProperty(value, "__proto__", {
      value: proto,
      enumerable: true,
      writable: true,
      configurable: true,
    })
    return value
  }

  const cases: [string, AnyFieldSchema, unknown[]][] = [
    [
      "ICRC-1 TransferArg",
      TransferArg,
      [
        {
          to: { owner: ANONYMOUS, subaccount: new Uint8Array(32).fill(1) },
          fee: 10_000n,
          memo: new TextEncoder().encode("rent"),
          from_subaccount: null,
          created_at_time: 2n ** 64n - 1n,
          amount: 2n ** 100n,
        },
        {
          to: { owner: LEDGER, subaccount: null },
          fee: null,
          memo: null,
          from_subaccount: new Uint8Array(0),
          created_at_time: null,
          amount: 0n,
        },
      ],
    ],
    [
      "a nested result variant",
      TransferResult,
      [
        { tag: "Ok", value: 1_234n },
        { tag: "Err", value: { tag: "TooOld" } },
        { tag: "Err", value: { tag: "BadFee", value: { expected_fee: 1n } } },
        {
          tag: "Err",
          value: {
            tag: "GenericError",
            value: { error_code: 5n, message: 'say "hi"\n\u202e' },
          },
        },
      ],
    ],
    [
      "opt opt",
      c.opt(c.opt(c.nat)),
      [null, { some: null }, { some: 0n }, { some: 99n }],
    ],
    [
      "opt opt opt",
      c.opt(c.opt(c.opt(c.text))),
      [null, { some: null }, { some: { some: null } }, { some: { some: "x" } }],
    ],
    [
      "tuples",
      c.vec(c.tuple([c.text, c.nat64, c.opt(c.int)])),
      [
        [],
        [
          ["a", 1n, null],
          ["", 2n ** 64n - 1n, -(2n ** 70n)],
        ],
      ],
    ],
    ["unnamed fields, __proto__, every leaf", Weird, [weird("own"), weird("")]],
    [
      "a recursive list",
      List,
      [
        { head: 1n, tail: null },
        { head: 1n, tail: { head: 2n, tail: { head: 3n, tail: null } } },
      ],
    ],
    [
      "a recursive tree",
      Tree,
      [
        { tag: "leaf", value: -1n },
        {
          tag: "node",
          value: {
            left: { tag: "leaf", value: 0n },
            right: {
              tag: "node",
              value: {
                left: { tag: "leaf", value: 1n },
                right: { tag: "leaf", value: 2n },
              },
            },
          },
        },
      ],
    ],
    [
      "floats",
      c.vec(c.float64),
      [[0, -0, 1.5, -1e-300, 1e300, Number.NaN, Infinity, -Infinity]],
    ],
    [
      "float32",
      c.vec(c.float32),
      [[Math.fround(0.1), Math.fround(3.4e38), -0, Number.NaN, Infinity]],
    ],
    [
      "fixed-width integers",
      c.tuple([c.nat8, c.nat16, c.nat32, c.int8, c.int16, c.int32]),
      [
        [0, 0, 0, 0, 0, 0],
        [255, 65_535, 4_294_967_295, -128, -32_768, -2_147_483_648],
      ],
    ],
    ["vec nat8 that is not a blob", c.vec(c.nat8), [[0, 1, 255]]],
    ["a blob", c.blob(), [new Uint8Array(0), Uint8Array.from([0, 255, 16])]],
  ]

  for (const [name, schema, values] of cases) {
    it(`gives back the same bytes: ${name}`, () => {
      for (const value of values) {
        expect(validate(schema as Schema<unknown>, value).ok).toBe(true)
        const json = wire(valueToJson(schema, value))
        const back = valueFromJson(schema, json)
        if (!back.ok) throw new Error(JSON.stringify(back.issues))
        expect(bytesOf(schema, back.value)).toEqual(bytesOf(schema, value))
        // And the JSON is a fixed point.
        expect(wire(valueToJson(schema, back.value))).toEqual(json)
      }
    })
  }
})

describe("argsFromInput", () => {
  it("reads no arguments", () => {
    expect(argsFromInput([], { kind: "none" }, {})).toEqual({
      ok: true,
      values: [],
    })
    expect(argsFromInput([], { kind: "none" }, undefined)).toEqual({
      ok: true,
      values: [],
    })
    expect(argsFromInput([], { kind: "none" }, { x: 1 })).toEqual({
      ok: false,
      issues: [
        { path: "$.x", message: "unknown key: this method takes no arguments" },
      ],
    })
    expect(argsFromInput([], { kind: "none" }, [1])).toMatchObject({
      ok: false,
      issues: [{ path: "$" }],
    })
  })

  it("reads one record argument from the input's own fields", () => {
    const result = argsFromInput(
      [TransferArg],
      { kind: "fields" },
      {
        to: { owner: "2vxsx-fae" },
        amount: "150000000",
      }
    )
    expect(result).toEqual({
      ok: true,
      values: [
        {
          to: { owner: ANONYMOUS, subaccount: null },
          fee: null,
          memo: null,
          from_subaccount: null,
          created_at_time: null,
          amount: 150_000_000n,
        },
      ],
    })
    expect(
      argsFromInput(
        [TransferArg],
        { kind: "fields" },
        {
          to: { owner: "nope!" },
          amout: "1",
        }
      )
    ).toMatchObject({
      ok: false,
      issues: [
        { path: "$.to.owner" },
        { path: "$.amount", message: "missing field (nat)" },
        { path: "$.amout" },
      ],
    })
    const opts = c.record({ a: c.opt(c.nat) })
    expect(argsFromInput([opts], { kind: "fields" }, undefined)).toEqual({
      ok: true,
      values: [{ a: null }],
    })
  })

  it("reads positional arguments arg0, arg1, …", () => {
    const args = [c.nat, c.opt(c.text), c.vec(c.nat)]
    const shape = { kind: "positional", count: 3 } as const
    expect(argsFromInput(args, shape, { arg0: "5", arg2: [] })).toEqual({
      ok: true,
      values: [5n, null, []],
    })
    expect(
      argsFromInput(args, shape, { arg0: "5", arg1: "x", arg2: ["1"] })
    ).toEqual({ ok: true, values: [5n, "x", [1n]] })
    expect(
      argsFromInput(args, shape, { arg1: null, arg2: ["1", "x"], arg_3: 1 })
    ).toEqual({
      ok: false,
      issues: [
        { path: "$.arg0", message: "missing argument (nat)" },
        {
          path: "$.arg2[1]",
          message:
            'expected nat as a decimal string (0 or more), such as "150000000", got the string "x"',
        },
        {
          path: "$.arg_3",
          message: 'unknown key; the arguments are "arg0", "arg1", "arg2"',
        },
      ],
    })
    expect(argsFromInput(args, shape, "5")).toMatchObject({
      ok: false,
      issues: [{ path: "$" }],
    })
  })

  it("lays out arguments as methodInput says", () => {
    for (const args of [
      [],
      [TransferArg],
      [c.nat],
      [c.tuple([c.nat])],
      [c.unit()],
      [Account, Account],
    ]) {
      const { shape } = methodInput(args)
      const input =
        shape.kind === "fields"
          ? { to: { owner: "aaaaa-aa" }, amount: "1" }
          : {}
      // The shape is accepted; the input may still be refused.
      expect(() => argsFromInput(args, shape, input)).not.toThrow()
    }
  })

  it("throws on a shape that is not the arguments'", () => {
    expect(() => argsFromInput([c.nat], { kind: "fields" }, { a: 1 })).toThrow(
      TypeError
    )
    expect(() =>
      argsFromInput([c.nat], { kind: "positional", count: 2 }, {})
    ).toThrow(TypeError)
    expect(() => argsFromInput([Account], { kind: "none" }, {})).toThrow(
      TypeError
    )
  })

  it("turns validate's issues into input issues under the argument's path", () => {
    vi.mocked(validate).mockReturnValueOnce({ ok: true })
    vi.mocked(validate).mockReturnValueOnce({
      ok: false,
      issues: [
        { code: "out_of_range", path: "$[0]", message: "too big" },
        { code: "invalid_type", path: '$["a b"]', message: "wrong" },
      ],
    })
    expect(
      argsFromInput(
        [c.nat, c.vec(c.nat)],
        { kind: "positional", count: 2 },
        { arg0: "1", arg1: ["2"] }
      )
    ).toEqual({
      ok: false,
      issues: [
        { path: "$.arg1[0]", message: "too big" },
        { path: '$.arg1["a b"]', message: "wrong" },
      ],
    })
    vi.mocked(validate).mockReturnValueOnce({
      ok: false,
      issues: [{ code: "invalid_type", path: "$.to", message: "wrong" }],
    })
    expect(
      argsFromInput(
        [TransferArg],
        { kind: "fields" },
        {
          to: { owner: "aaaaa-aa" },
          amount: "1",
        }
      )
    ).toEqual({ ok: false, issues: [{ path: "$.to", message: "wrong" }] })
  })

  it("shares the value bound across arguments", () => {
    const row = Array.from({ length: INPUT_LIMITS.maxVecLength }, () => 1)
    const args = Array.from({ length: 11 }, () => c.vec(c.nat8))
    const input = Object.fromEntries(args.map((_, i) => [`arg${i}`, row]))
    // Each argument is 10,001 values: the 100,001st is arg9's element 9990.
    const result = argsFromInput(args, { kind: "positional", count: 11 }, input)
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "$.arg9[9990]" }],
    })
  })
})

describe("resultArms", () => {
  it("gives the payloads of an Ok/Err or ok/err variant", () => {
    const Err = c.variant({ TooOld: c.null })
    const arms = resultArms([c.rec(() => c.variant({ Ok: c.nat, Err }))])
    expect(arms?.ok).toBe(c.nat)
    expect(arms?.err).toBe(Err)
    const lower = resultArms([c.variant({ err: c.text, ok: c.null })])
    expect(lower).toEqual({ ok: c.null, err: c.text })
  })

  it("gives nothing for anything else", () => {
    expect(resultArms([])).toBeUndefined()
    expect(resultArms([c.nat])).toBeUndefined()
    expect(resultArms([c.variant({ Ok: c.nat, err: c.text })])).toBeUndefined()
    expect(
      resultArms([c.variant({ Ok: c.nat, Err: c.text, Other: c.null })])
    ).toBeUndefined()
    expect(
      resultArms([c.variant({ Ok: c.nat, Err: c.text }), c.nat])
    ).toBeUndefined()
    expect(resultArms([c.record({ Ok: c.nat, Err: c.text })])).toBeUndefined()
  })
})
