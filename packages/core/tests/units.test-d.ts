/**
 * The types of `parseUnits` and `formatUnits`.
 *
 * Both are strict about what they take: `parseUnits` reads text only, since a
 * `Number` amount is the lossy input it replaces, and `formatUnits` shows a
 * `bigint` only, which is what a ledger's `nat` is in a generated module.
 * Neither takes an option it does not implement, so a v3 name such as
 * `allowNegative` or `locale` is a compile error and not silently ignored.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import { formatUnits, parseUnits } from "../src/index.js"

// `icrc1_balance_of : (Account) -> (nat) query` and
// `icrc1_decimals : () -> (nat8) query`, as a generated module returns them.
declare const balance: bigint
declare const decimals: number
declare const loading: bigint | undefined
declare const input: string

describe("parseUnits", () => {
  it("returns a bigint", () => {
    expectTypeOf(parseUnits("1.5", 8)).toEqualTypeOf<bigint>()
    expectTypeOf(parseUnits(input, decimals)).toEqualTypeOf<bigint>()
    expectTypeOf(parseUnits("-1", 8, { signed: true })).toEqualTypeOf<bigint>()
  })

  it("takes text only", () => {
    // @ts-expect-error a Number amount is the lossy input this replaces
    parseUnits(1.5, 8)
    // @ts-expect-error nor is a bigint
    parseUnits(balance, 8)
    // @ts-expect-error nor an amount that may still be missing
    parseUnits(undefined, 8)
  })

  it("takes decimals as a number, and requires it", () => {
    // @ts-expect-error decimals are required
    parseUnits("1.5")
    // @ts-expect-error a bigint decimals is converted with Number() first
    parseUnits("1.5", 8n)
    // @ts-expect-error digit text is not decimals
    parseUnits("1.5", "8")
  })

  it("types its options", () => {
    expectTypeOf(parseUnits)
      .parameter(2)
      .toEqualTypeOf<{ signed?: boolean } | undefined>()

    parseUnits("1.5", 8, {})
    parseUnits("1.5", 8, { signed: false })
    // @ts-expect-error signed is a boolean
    parseUnits("-1", 8, { signed: "true" })
    // @ts-expect-error v3 called it allowNegative
    parseUnits("-1", 8, { allowNegative: true })
    // @ts-expect-error not an option
    parseUnits("1.5", 8, { decimals: 2 })
  })
})

describe("formatUnits", () => {
  it("returns a string", () => {
    expectTypeOf(formatUnits(balance, 8)).toEqualTypeOf<string>()
    expectTypeOf(formatUnits(150_000_000n, decimals)).toEqualTypeOf<string>()
    expectTypeOf(
      formatUnits(balance, 8, { maxFractionDigits: 2, minFractionDigits: 2 })
    ).toEqualTypeOf<string>()
  })

  it("takes a bigint only", () => {
    // @ts-expect-error a Number amount cannot hold every balance
    formatUnits(1.5, 8)
    // @ts-expect-error not even a whole one
    formatUnits(150_000_000, 8)
    // @ts-expect-error integer text is not an amount; read it with BigInt
    formatUnits("150000000", 8)
    // @ts-expect-error the amount may be undefined while it loads
    formatUnits(loading, 8)
    // @ts-expect-error null is not an amount
    formatUnits(null, 8)
  })

  it("takes decimals as a number, and requires it", () => {
    // @ts-expect-error decimals are required
    formatUnits(balance)
    // @ts-expect-error a bigint decimals is converted with Number() first
    formatUnits(balance, 8n)
    // @ts-expect-error digit text is not decimals
    formatUnits(balance, "8")
  })

  it("types its options", () => {
    expectTypeOf(formatUnits)
      .parameter(2)
      .toEqualTypeOf<
        { maxFractionDigits?: number; minFractionDigits?: number } | undefined
      >()

    formatUnits(balance, 8, {})
    formatUnits(balance, 8, { maxFractionDigits: 2 })
    formatUnits(balance, 8, { minFractionDigits: 2 })
    // @ts-expect-error the digit counts are numbers
    formatUnits(balance, 8, { maxFractionDigits: "2" })
    // @ts-expect-error v3 had rounding modes; this cuts and never rounds
    formatUnits(balance, 8, { roundingMode: "halfExpand" })
    // @ts-expect-error v3 had a locale; format the plain text with Intl
    formatUnits(balance, 8, { locale: "de-DE" })
    // @ts-expect-error v3 had grouping; format the plain text with Intl
    formatUnits(balance, 8, { useGrouping: true })
    // @ts-expect-error v3 had trimTrailingZeros; minFractionDigits pads
    formatUnits(balance, 8, { trimTrailingZeros: false })
    // @ts-expect-error not an option
    formatUnits(balance, 8, { decimals: 2 })
  })
})
