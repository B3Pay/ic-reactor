/**
 * `formatTokenAmount` and `parseTokenAmount`: exact conversions between a
 * token's base units and decimal text.
 *
 * Seven examples converted with `Number` and `Math.pow`, which is lossy:
 * `Math.floor(Number("0.29") * 10 ** 8)` is 28999999, so the app sent
 * 0.28999999 for 0.29, and at 18 decimals 1.1 became 1100000000000000100.
 * These tests pin that both helpers are exact for every amount, that parsing
 * refuses what it cannot represent instead of rounding it, and that the two
 * round-trip.
 */
import { describe, it, expect } from "vitest"
import { formatTokenAmount, parseTokenAmount } from "../src/index.js"

describe("formatTokenAmount", () => {
  it("shows base units as decimal text, dropping zeros at the end", () => {
    expect(formatTokenAmount(150_000_000n, 8)).toBe("1.5")
    expect(formatTokenAmount(100_000_000n, 8)).toBe("1")
    expect(formatTokenAmount(1n, 8)).toBe("0.00000001")
    expect(formatTokenAmount(0n, 8)).toBe("0")
    expect(formatTokenAmount(29_000_000n, 8)).toBe("0.29")
    expect(formatTokenAmount(123n, 0)).toBe("123")
  })

  it("takes a DisplayReactor's integer text and a safe integer, and decimals in every form", () => {
    expect(formatTokenAmount("150000000", 8)).toBe("1.5")
    expect(formatTokenAmount(150_000_000, 8)).toBe("1.5")
    expect(formatTokenAmount(150_000_000n, 8n)).toBe("1.5")
    expect(formatTokenAmount(150_000_000n, "8")).toBe("1.5")
    expect(formatTokenAmount("-150000000", 8)).toBe("-1.5")
  })

  it("is exact past what a Number holds", () => {
    expect(formatTokenAmount(9_007_199_254_740_993n, 0)).toBe(
      "9007199254740993"
    )
    expect(formatTokenAmount(1_100_000_000_000_000_000n, 18)).toBe("1.1")
    expect(
      formatTokenAmount(123_456_789_012_345_678_901_234_567_890n, 18)
    ).toBe("123456789012.34567890123456789")
    expect(formatTokenAmount(10n ** 30n + 1n, 18)).toBe(
      "1000000000000.000000000000000001"
    )
  })

  it("writes a negative amount with a leading minus", () => {
    expect(formatTokenAmount(-150_000_000n, 8)).toBe("-1.5")
    expect(formatTokenAmount(-1n, 8)).toBe("-0.00000001")
    // Nothing left to show is not negative.
    expect(formatTokenAmount(-1n, 8, { maxFractionDigits: 2 })).toBe("0")
  })

  describe("maxFractionDigits", () => {
    it("cuts the digits past it by default, never showing more than is held", () => {
      expect(formatTokenAmount(99_999_999n, 8, { maxFractionDigits: 2 })).toBe(
        "0.99"
      )
      expect(formatTokenAmount(123_456_789n, 8, { maxFractionDigits: 4 })).toBe(
        "1.2345"
      )
      expect(formatTokenAmount(123_456_789n, 8, { maxFractionDigits: 0 })).toBe(
        "1"
      )
      expect(
        formatTokenAmount(-199_999_999n, 8, { maxFractionDigits: 2 })
      ).toBe("-1.99")
    })

    it("rounds half away from zero under roundingMode halfExpand, carrying into the whole part", () => {
      const halfExpand = { roundingMode: "halfExpand" } as const
      expect(
        formatTokenAmount(99_999_999n, 8, {
          ...halfExpand,
          maxFractionDigits: 2,
        })
      ).toBe("1")
      expect(
        formatTokenAmount(123_456_789n, 8, {
          ...halfExpand,
          maxFractionDigits: 4,
        })
      ).toBe("1.2346")
      expect(
        formatTokenAmount(125n, 2, { ...halfExpand, maxFractionDigits: 1 })
      ).toBe("1.3")
      expect(
        formatTokenAmount(124n, 2, { ...halfExpand, maxFractionDigits: 1 })
      ).toBe("1.2")
      expect(
        formatTokenAmount(-125n, 2, { ...halfExpand, maxFractionDigits: 1 })
      ).toBe("-1.3")
      // No digit is dropped, so nothing rounds.
      expect(formatTokenAmount(125n, 2, halfExpand)).toBe("1.25")
    })

    it("shows the amount exactly when it is at least the token's decimals", () => {
      expect(
        formatTokenAmount(150_000_000n, 8, { maxFractionDigits: 12 })
      ).toBe("1.5")
    })
  })

  describe("padding", () => {
    it("pads to minFractionDigits", () => {
      expect(formatTokenAmount(100_000_000n, 8, { minFractionDigits: 2 })).toBe(
        "1.00"
      )
      expect(formatTokenAmount(150_000_000n, 8, { minFractionDigits: 2 })).toBe(
        "1.50"
      )
      expect(formatTokenAmount(123_456_789n, 8, { minFractionDigits: 2 })).toBe(
        "1.23456789"
      )
      // Past the token's own digits too.
      expect(formatTokenAmount(5n, 0, { minFractionDigits: 2 })).toBe("5.00")
      expect(
        formatTokenAmount(100_000_000n, 8, {
          minFractionDigits: 2,
          maxFractionDigits: 2,
        })
      ).toBe("1.00")
    })

    it("pads to maxFractionDigits with trimTrailingZeros false", () => {
      expect(
        formatTokenAmount(100_000_000n, 8, { trimTrailingZeros: false })
      ).toBe("1.00000000")
      expect(
        formatTokenAmount(150_000_000n, 8, {
          trimTrailingZeros: false,
          maxFractionDigits: 4,
        })
      ).toBe("1.5000")
      expect(formatTokenAmount(5n, 0, { trimTrailingZeros: false })).toBe("5")
    })
  })

  describe("grouping and locale", () => {
    it("groups thousands with a comma when asked, without a locale", () => {
      expect(
        formatTokenAmount(123_456_789_000_000n, 8, { useGrouping: true })
      ).toBe("1,234,567.89")
      expect(
        formatTokenAmount(-100_000_000_000n, 8, { useGrouping: true })
      ).toBe("-1,000")
      expect(formatTokenAmount(99_900_000_000n, 8, { useGrouping: true })).toBe(
        "999"
      )
      // Plain text by default, so it reads back through parseTokenAmount.
      expect(formatTokenAmount(123_456_789_000_000n, 8)).toBe("1234567.89")
    })

    it("writes what Intl.NumberFormat writes for a value a Number holds exactly", () => {
      const locales = ["en-US", "de-DE", "fr-FR", "de-CH", "en-IN", "ar-EG"]
      // [base units, decimals, the same value as a Number, fraction digits]
      const cases: Array<[bigint, number, number, number]> = [
        [123_456_750n, 2, 1_234_567.5, 1],
        [-123_456_750n, 2, -1_234_567.5, 1],
        [-50n, 2, -0.5, 1],
        [1_234_567_890_000n, 8, 12_345.6789, 4],
        [7n, 0, 7, 0],
      ]
      for (const locale of locales) {
        for (const [units, decimals, number, digits] of cases) {
          const intl = new Intl.NumberFormat(locale, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }).format(number)
          expect(
            formatTokenAmount(units, decimals, { locale }),
            `${units} at ${decimals} decimals in ${locale}`
          ).toBe(intl)
        }
      }
    })

    it("follows useGrouping false and a list of locales", () => {
      expect(
        formatTokenAmount(123_456_750n, 2, {
          locale: "de-DE",
          useGrouping: false,
        })
      ).toBe("1234567,5")
      expect(
        formatTokenAmount(123_456_750n, 2, { locale: ["de-DE", "en-US"] })
      ).toBe("1.234.567,5")
    })

    it("stays exact where Intl.NumberFormat given a Number would not", () => {
      expect(
        formatTokenAmount(10n ** 30n + 1n, 18, {
          locale: "en-US",
        })
      ).toBe("1,000,000,000,000.000000000000000001")
      expect(
        formatTokenAmount(1_100_000_000_000_000_000n, 18, { locale: "de-DE" })
      ).toBe("1,1")
    })
  })

  describe("refuses what is not an amount in base units", () => {
    it.each([
      ["a decimal Number", 1.5],
      ["decimal text", "1.5"],
      ["an unsafe integer", 2 ** 53],
      ["blank text", ""],
      ["grouped text", "1,000"],
      ["undefined", undefined],
      ["null", null],
    ])("%s", (_, value) => {
      expect(() => formatTokenAmount(value as never, 8)).toThrow(TypeError)
      expect(() => formatTokenAmount(value as never, 8)).toThrow(
        /expected an amount in base units/
      )
    })

    it("points decimal text at parseTokenAmount", () => {
      expect(() => formatTokenAmount("1.5", 8)).toThrow(/parseTokenAmount/)
    })

    it("refuses decimals that are not a whole number from 0 to 255", () => {
      expect(() => formatTokenAmount(1n, 1.5)).toThrow(TypeError)
      expect(() => formatTokenAmount(1n, "8.0")).toThrow(TypeError)
      expect(() => formatTokenAmount(1n, "")).toThrow(TypeError)
      expect(() => formatTokenAmount(1n, undefined as never)).toThrow(TypeError)
      expect(() => formatTokenAmount(1n, -1)).toThrow(RangeError)
      expect(() => formatTokenAmount(1n, 256)).toThrow(RangeError)
      expect(() => formatTokenAmount(1n, 10n ** 400n)).toThrow(TypeError)
      expect(formatTokenAmount(1n, 255)).toBe(`0.${"0".repeat(254)}1`)
    })

    it("refuses digit options it cannot honour", () => {
      expect(() =>
        formatTokenAmount(1n, 8, { minFractionDigits: 4, maxFractionDigits: 2 })
      ).toThrow(RangeError)
      expect(() => formatTokenAmount(1n, 8, { maxFractionDigits: -1 })).toThrow(
        RangeError
      )
      expect(() =>
        formatTokenAmount(1n, 8, { minFractionDigits: 0.5 })
      ).toThrow(RangeError)
      expect(() =>
        formatTokenAmount(1n, 8, { roundingMode: "floor" as never })
      ).toThrow(RangeError)
    })
  })
})

describe("parseTokenAmount", () => {
  it("reads decimal text as base units, exactly", () => {
    expect(parseTokenAmount("1.5", 8)).toBe(150_000_000n)
    expect(parseTokenAmount("1", 8)).toBe(100_000_000n)
    expect(parseTokenAmount("0.00000001", 8)).toBe(1n)
    expect(parseTokenAmount("0", 8)).toBe(0n)
    expect(parseTokenAmount("12", 0)).toBe(12n)
  })

  it("does not lose what Number math loses", () => {
    // The conversion the examples used.
    expect(Math.floor(Number("0.29") * Math.pow(10, 8))).toBe(28_999_999)
    expect(parseTokenAmount("0.29", 8)).toBe(29_000_000n)

    expect(BigInt(Math.floor(Number("1.1") * 10 ** 18))).toBe(
      1_100_000_000_000_000_128n
    )
    expect(parseTokenAmount("1.1", 18)).toBe(1_100_000_000_000_000_000n)

    expect(parseTokenAmount("123456789012.345678901234567890", 18)).toBe(
      123_456_789_012_345_678_901_234_567_890n
    )
  })

  it("takes decimals in every form icrc1_decimals comes back in", () => {
    expect(parseTokenAmount("1.5", 8n)).toBe(150_000_000n)
    expect(parseTokenAmount("1.5", "8")).toBe(150_000_000n)
  })

  it("accepts what a person types on the way to an amount", () => {
    expect(parseTokenAmount("5.", 8)).toBe(500_000_000n)
    expect(parseTokenAmount(".5", 8)).toBe(50_000_000n)
    expect(parseTokenAmount("  2  ", 8)).toBe(200_000_000n)
    expect(parseTokenAmount("007", 8)).toBe(700_000_000n)
  })

  it("accepts zeros past the token's decimals, which change nothing", () => {
    expect(parseTokenAmount("1.100000000", 8)).toBe(110_000_000n)
    expect(parseTokenAmount("12.000", 0)).toBe(12n)
  })

  it("refuses more significant fraction digits than the token has", () => {
    expect(() => parseTokenAmount("0.123456789", 8)).toThrow(RangeError)
    expect(() => parseTokenAmount("0.123456789", 8)).toThrow(
      /9 fraction digits, more than the token's 8 decimals/
    )
    expect(() => parseTokenAmount("1.5", 0)).toThrow(RangeError)
    expect(() => parseTokenAmount("0.0000000000000000001", 18)).toThrow(
      RangeError
    )
  })

  it("refuses a negative amount unless allowNegative is set", () => {
    expect(() => parseTokenAmount("-1.5", 8)).toThrow(RangeError)
    expect(() => parseTokenAmount("-1.5", 8)).toThrow(/allowNegative/)
    expect(() => parseTokenAmount("-0", 8)).toThrow(RangeError)
    expect(parseTokenAmount("-1.5", 8, { allowNegative: true })).toBe(
      -150_000_000n
    )
    expect(parseTokenAmount("-.5", 8, { allowNegative: true })).toBe(
      -50_000_000n
    )
    expect(parseTokenAmount("-0", 8, { allowNegative: true })).toBe(0n)
  })

  it.each([
    ["blank text", ""],
    ["whitespace", "   "],
    ["a lone point", "."],
    ["a lone minus", "-"],
    ["grouping", "1,000"],
    ["a comma decimal", "1,5"],
    ["an exponent", "1e-8"],
    ["letters", "abc"],
    ["a unit", "1.5 ICP"],
    ["two points", "1.2.3"],
    ["a plus sign", "+1"],
    ["hex", "0x10"],
    ["inner whitespace", "1 000"],
    ["non-ASCII digits", "١٢"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
  ])("refuses %s", (_, text) => {
    expect(() => parseTokenAmount(text, 8)).toThrow(TypeError)
    expect(() => parseTokenAmount(text, 8)).toThrow(/is not a decimal amount/)
  })

  it("refuses what is not text, and decimals that are not a whole number from 0 to 255", () => {
    expect(() => parseTokenAmount(1.5 as never, 8)).toThrow(TypeError)
    expect(() => parseTokenAmount(undefined as never, 8)).toThrow(TypeError)
    expect(() => parseTokenAmount("1", -1)).toThrow(RangeError)
    expect(() => parseTokenAmount("1", 256)).toThrow(RangeError)
    expect(() => parseTokenAmount("1", 8.5)).toThrow(TypeError)
  })
})

describe("formatTokenAmount and parseTokenAmount", () => {
  // A small deterministic generator, so a failure reproduces.
  let seed = 0x2545f491
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed >>> 0
  }
  const randomUnits = (): bigint => {
    const digits = 1 + (next() % 40)
    let text = ""
    for (let i = 0; i < digits; i++) text += String(next() % 10)
    return BigInt(text)
  }

  it("round-trip every amount at every common decimals", () => {
    for (const decimals of [0, 1, 2, 6, 8, 18, 30]) {
      for (let i = 0; i < 200; i++) {
        const units = randomUnits()
        const text = formatTokenAmount(units, decimals)
        expect(parseTokenAmount(text, decimals), `${units}@${decimals}`).toBe(
          units
        )
        expect(
          parseTokenAmount(
            formatTokenAmount(units, decimals, { trimTrailingZeros: false }),
            decimals
          )
        ).toBe(units)
        expect(
          parseTokenAmount(formatTokenAmount(-units, decimals), decimals, {
            allowNegative: true,
          })
        ).toBe(-units)
      }
    }
  })

  it("reads back the text it shows, and shows the text it reads", () => {
    for (const text of ["0", "1", "0.29", "1.5", "0.00000001", "12345678.9"]) {
      expect(formatTokenAmount(parseTokenAmount(text, 8), 8)).toBe(text)
    }
  })
})
