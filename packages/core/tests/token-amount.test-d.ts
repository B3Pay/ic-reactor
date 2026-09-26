/**
 * The types of `formatTokenAmount` and `parseTokenAmount`.
 *
 * Both take a ledger's values as either reactor returns them, with no
 * conversion at the call site: a `Reactor` gives a `nat` as a `bigint` and a
 * `nat8` as a `number`, a `DisplayReactor` gives the `nat` as text. An
 * amount that may still be loading (`undefined`) is refused, so a component
 * has to decide what to show until it arrives.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { Principal } from "@icp-sdk/core/principal"
import {
  formatTokenAmount,
  parseTokenAmount,
  type FormatTokenAmountOptions,
  type ParseTokenAmountOptions,
} from "../src/index.js"
import type { DisplayOf } from "../src/display/types.js"

// `icrc1_balance_of : (Account) -> (nat) query` and
// `icrc1_decimals : () -> (nat8) query`, as each reactor returns them.
declare const rawBalance: bigint
declare const rawDecimals: number
declare const displayBalance: DisplayOf<bigint>
declare const displayDecimals: DisplayOf<number>
// `icrc1:decimals` read from `icrc1_metadata` is a `nat`.
declare const metadataDecimals: DisplayOf<bigint>
declare const loading: bigint | undefined

describe("formatTokenAmount", () => {
  it("takes a Reactor's and a DisplayReactor's values as they are", () => {
    expectTypeOf(displayBalance).toEqualTypeOf<string>()
    expectTypeOf(
      formatTokenAmount(rawBalance, rawDecimals)
    ).toEqualTypeOf<string>()
    expectTypeOf(
      formatTokenAmount(displayBalance, displayDecimals)
    ).toEqualTypeOf<string>()
    expectTypeOf(
      formatTokenAmount(displayBalance, metadataDecimals)
    ).toEqualTypeOf<string>()
    expectTypeOf(formatTokenAmount(rawBalance, 8n)).toEqualTypeOf<string>()
  })

  it("refuses an amount that is not there yet, and a principal", () => {
    // @ts-expect-error the amount may be undefined while it loads
    formatTokenAmount(loading, 8)
    // @ts-expect-error null is not an amount
    formatTokenAmount(null, 8)
    // @ts-expect-error nor is a principal
    formatTokenAmount({} as Principal, 8)
    // @ts-expect-error decimals are required
    formatTokenAmount(rawBalance)
  })

  it("types its options", () => {
    expectTypeOf<FormatTokenAmountOptions>().toEqualTypeOf<{
      maxFractionDigits?: number
      minFractionDigits?: number
      trimTrailingZeros?: boolean
      roundingMode?: "trunc" | "halfExpand"
      locale?: string | readonly string[]
      useGrouping?: boolean
    }>()

    formatTokenAmount(rawBalance, 8, { locale: ["de-DE", "en-US"] as const })
    // @ts-expect-error only the two rounding modes it implements
    formatTokenAmount(rawBalance, 8, { roundingMode: "floor" })
    // @ts-expect-error a locale is a BCP 47 tag
    formatTokenAmount(rawBalance, 8, { locale: 1 })
    // @ts-expect-error not an option
    formatTokenAmount(rawBalance, 8, { decimals: 2 })
  })
})

describe("parseTokenAmount", () => {
  it("returns a bigint, which a DisplayReactor takes as its text", () => {
    const amount = parseTokenAmount("1.5", displayDecimals)
    expectTypeOf(amount).toEqualTypeOf<bigint>()
    expectTypeOf(amount.toString()).toEqualTypeOf<DisplayOf<bigint>>()
    expectTypeOf(parseTokenAmount("1.5", rawDecimals)).toEqualTypeOf<bigint>()
    expectTypeOf(
      parseTokenAmount("1.5", metadataDecimals)
    ).toEqualTypeOf<bigint>()
  })

  it("takes text only, and types its options", () => {
    // @ts-expect-error a Number amount is the lossy input this replaces
    parseTokenAmount(1.5, 8)
    expectTypeOf<ParseTokenAmountOptions>().toEqualTypeOf<{
      allowNegative?: boolean
    }>()
    parseTokenAmount("-1", 8, { allowNegative: true })
  })
})
