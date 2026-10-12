import { c, serviceMethods, type AnyFieldSchema } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import { actor as icpActor } from "../canisters/icp_ledger.ts"
import { TransferArg } from "../canisters/icrc1.ts"
import { toHex } from "../lib/hex.ts"
import {
  nanosToUtcInput,
  parseTokenAmount,
  subaccountFromNumber,
  tokenAmountText,
  utcInputToNanos,
} from "./convert.ts"
import {
  checkCall,
  draftFromValue,
  draftValues,
  fieldsOf,
  resolve,
} from "./engine.ts"
import { combineHints, heuristicHints, type FieldHint } from "./hints.ts"
import { argsToJson, parseArgsJson, quoteUnsafeIntegers } from "./json.ts"

const CKBTC = { decimals: 8, symbol: "ckBTC" }
const CKETH = { decimals: 18, symbol: "ckETH" }

function hintsOf(
  schema: AnyFieldSchema,
  resolver = heuristicHints({ units: CKBTC })
): Record<string, FieldHint | undefined> {
  const node = resolve(schema)
  if (node.kind !== "record") throw new Error("a record")
  return Object.fromEntries(
    fieldsOf(node).map(([key, field]) => [
      key,
      resolver({ path: `$args[0].${key}`, key, schema: field, method: "m" }),
    ])
  )
}

describe("heuristicHints", () => {
  it("dresses an ICRC-1 transfer", () => {
    const hints = hintsOf(TransferArg)
    expect(hints.created_at_time).toMatchObject({
      widget: "timestamp-nanos",
      nowByDefault: true,
    })
    expect(hints.amount).toEqual({ units: CKBTC })
    expect(hints.fee).toEqual({ units: CKBTC })
    expect(hints.memo).toMatchObject({ widget: "memo-text" })
    expect(hints.from_subaccount).toMatchObject({ widget: "subaccount" })
    expect(hints.to).toBeUndefined() // an Account record: its owner is hinted
  })

  it("gives no units without units, and none to fields of other types", () => {
    const hints = hintsOf(TransferArg, heuristicHints())
    expect(hints.amount).toBeUndefined()
    expect(hints.created_at_time).toMatchObject({ nowByDefault: true })
  })

  it("dresses the ICP ledger's legacy transfer (TimeStamp record, e8s, nat64 memo)", () => {
    const transfer = serviceMethods(icpActor).get("transfer")
    const hints = hintsOf(
      transfer?.args[0] as AnyFieldSchema,
      heuristicHints({ units: { decimals: 8, symbol: "ICP" } })
    )
    expect(hints.created_at_time).toMatchObject({ nowByDefault: true })
    expect(hints.memo).toMatchObject({ description: expect.any(String) })
    expect(hints.memo?.widget).toBeUndefined()
    const resolver = heuristicHints({ units: { decimals: 8, symbol: "ICP" } })
    expect(
      resolver({ path: "$", key: "e8s", schema: c.nat64, method: "transfer" })
    ).toEqual({
      units: { decimals: 8, symbol: "ICP" },
    })
    expect(
      resolver({
        path: "$",
        key: "timestamp_nanos",
        schema: c.nat64,
        method: "transfer",
      })
    ).toEqual({
      widget: "timestamp-nanos",
    })
  })

  it("lets a later resolver refine an earlier one", () => {
    const combined = combineHints(
      heuristicHints({ units: CKBTC }),
      ({ key }) => (key === "amount" ? { label: "Amount" } : undefined)
    )
    expect(
      combined({ path: "$", key: "amount", schema: c.nat, method: "m" })
    ).toEqual({
      units: CKBTC,
      label: "Amount",
    })
  })
})

describe("token amounts", () => {
  it("reads decimals exactly, at any size", () => {
    expect(parseTokenAmount("1.5", CKBTC)).toEqual({
      ok: true,
      value: 150_000_000n,
    })
    expect(parseTokenAmount("0.00000001", CKBTC)).toEqual({
      ok: true,
      value: 1n,
    })
    expect(parseTokenAmount("123456789.123456789123456789", CKETH)).toEqual({
      ok: true,
      value: 123456789123456789123456789n,
    })
  })

  it("refuses what it cannot hold exactly, never rounding", () => {
    for (const text of ["1.123456789", "1,5", "1e3", "-1", "abc", ""]) {
      expect(parseTokenAmount(text, CKBTC).ok, text).toBe(false)
    }
    const refused = parseTokenAmount("1.123456789", CKBTC)
    expect(!refused.ok && refused.message).toMatch(
      /more than the token's 8 decimals/
    )
    expect(!refused.ok && refused.message).not.toMatch(/ic-reactor/)
    expect(parseTokenAmount("-1", CKBTC, true)).toEqual({
      ok: true,
      value: -100_000_000n,
    })
  })

  it("shows base units as a decimal", () => {
    expect(tokenAmountText("150000000", CKBTC)).toBe("1.5")
    expect(tokenAmountText("x", CKBTC)).toBeUndefined()
  })
})

describe("timestamps", () => {
  it("converts nanoseconds and the UTC picker both ways, independent of time zone", () => {
    const ns = 1_760_236_265_123_456_789n
    expect(nanosToUtcInput(ns)).toBe("2025-10-12T02:31:05.123")
    expect(utcInputToNanos("2025-10-12T02:31:05.123")).toBe(
      1_760_236_265_123_000_000n
    )
    expect(utcInputToNanos("2025-10-12T02:31")).toBe(1_760_236_260_000_000_000n)
    // Years 0000-0099 are not read as 1900-1999 (Date.UTC's rule).
    expect(utcInputToNanos("0070-01-01T00:00")).toBe(
      -59_958_144_000_000_000_000n
    )
    // A day or time that rolls over is refused, not moved.
    expect(utcInputToNanos("2025-02-30T00:00")).toBeUndefined()
    expect(utcInputToNanos("2025-10-12T24:00")).toBeUndefined()
    expect(nanosToUtcInput(0n)).toBe("1970-01-01T00:00:00")
    expect(utcInputToNanos("not a date")).toBeUndefined()
  })
})

describe("subaccounts", () => {
  it("makes 32 big-endian bytes from a number", () => {
    const one = subaccountFromNumber("1")
    expect(one.ok && toHex(one.value)).toBe("00".repeat(31) + "01")
    const big = subaccountFromNumber("65_536")
    expect(big.ok && toHex(big.value)).toBe("00".repeat(29) + "010000")
    expect(subaccountFromNumber((1n << 256n).toString()).ok).toBe(false)
    expect(subaccountFromNumber("-1").ok).toBe(false)
  })
})

describe("arguments as JSON", () => {
  const transfer = {
    to: { owner: "ryjl3-tyaaa-aaaaa-aaaba-cai", subaccount: null },
    fee: null,
    memo: Uint8Array.of(1, 2),
    from_subaccount: null,
    created_at_time: 1_760_236_265_123_456_789n,
    amount: 2n ** 80n,
  }

  it("round-trips through the form: bigints past 2^53, bytes as hex", () => {
    const json = argsToJson([transfer])
    expect(json).toContain('"amount": "1208925819614629174706176"')
    expect(json).toContain('"memo": "0102"')
    const parsed = parseArgsJson(json, [TransferArg])
    if (!parsed.ok) throw new Error(parsed.message)
    const check = checkCall(
      [TransferArg],
      [draftFromValue(TransferArg, parsed.values[0])]
    )
    expect(check.values).toEqual([transfer])
  })

  it("keeps the digits of bare integer literals past 2^53", () => {
    expect(
      quoteUnsafeIntegers(
        '{"a": 12345678901234567890, "b": "9007199254740993", "c": 1.5e300, "d": -9007199254740993}'
      )
    ).toBe(
      '{"a": "12345678901234567890", "b": "9007199254740993", "c": 1.5e300, "d": "-9007199254740993"}'
    )
    const parsed = parseArgsJson(
      '[{"to": {"owner": "aaaaa-aa", "subaccount": null}, "fee": null, "memo": null, "from_subaccount": null, "created_at_time": null, "amount": 12345678901234567890}]',
      [TransferArg]
    )
    if (!parsed.ok) throw new Error(parsed.message)
    const values = draftValues(
      [TransferArg],
      [draftFromValue(TransferArg, parsed.values[0])]
    )
    expect((values[0] as { amount: bigint }).amount).toBe(12345678901234567890n)
  })

  it("takes a bare value for one argument and says what is wrong otherwise", () => {
    const vecNat = [c.vec(c.nat)]
    expect(parseArgsJson("5", [c.nat])).toEqual({ ok: true, values: [5] })
    expect(parseArgsJson("[1, 2]", vecNat)).toEqual({
      ok: true,
      values: [[1, 2]],
    })
    expect(parseArgsJson("[1]", [c.nat, c.nat])).toEqual({
      ok: false,
      message: "Expected 2 argument values, got 1.",
    })
    expect(parseArgsJson("{", [c.nat]).ok).toBe(false)
  })
})
