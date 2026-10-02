/**
 * `parseUnits` and `formatUnits`: exact conversions between a token's base
 * units and decimal text.
 *
 * Converting with `Number` is lossy: `Math.floor(Number("0.29") * 10 ** 8)` is
 * 28999999, so an app sent 0.28999999 for 0.29, and viem's `parseUnits`
 * rounds `"0.123456789"` at 8 decimals to 12345679n and accepts `"-1"`. These
 * tests pin that both helpers work on the digits, that parsing refuses what it
 * cannot represent instead of rounding it, that formatting never shows more
 * than is held, and that the two round-trip.
 */
import { describe, it, expect } from "vitest"
import { formatUnits, parseUnits } from "../src/index.js"

describe("parseUnits", () => {
  it("reads decimal text as base units, exactly", () => {
    expect(parseUnits("0.29", 8)).toBe(29_000_000n)
    expect(parseUnits("1.5", 8)).toBe(150_000_000n)
    expect(parseUnits("1", 8)).toBe(100_000_000n)
    expect(parseUnits("0", 8)).toBe(0n)
    expect(parseUnits("0.00000001", 8)).toBe(1n)
    expect(parseUnits("12", 0)).toBe(12n)
  })

  it("does not lose what Number math loses", () => {
    expect(Math.floor(Number("0.29") * Math.pow(10, 8))).toBe(28_999_999)
    expect(parseUnits("0.29", 8)).toBe(29_000_000n)

    expect(BigInt(Math.floor(Number("1.1") * 10 ** 18))).toBe(
      1_100_000_000_000_000_128n
    )
    expect(parseUnits("1.1", 18)).toBe(1_100_000_000_000_000_000n)

    expect(parseUnits("123456789012.345678901234567890", 18)).toBe(
      123_456_789_012_345_678_901_234_567_890n
    )
  })

  it("is exact for a whole number of any length, with no upper bound", () => {
    expect(parseUnits("18446744073709551615", 0)).toBe(
      18_446_744_073_709_551_615n
    )
    // 2^64: a nat64 field refuses it when the call is encoded, which is the
    // Candid type's limit; an ICRC-1 nat has none, so parsing does not cap.
    expect(parseUnits("18446744073709551616", 0)).toBe(2n ** 64n)
    expect(parseUnits("1234567890123456789012345678901234567890", 0)).toBe(
      1_234_567_890_123_456_789_012_345_678_901_234_567_890n
    )
    expect(parseUnits("1234567890123456789012345678901234567890.5", 1)).toBe(
      12_345_678_901_234_567_890_123_456_789_012_345_678_905n
    )
  })

  it("accepts what a person types on the way to an amount", () => {
    expect(parseUnits(".5", 8)).toBe(50_000_000n)
    expect(parseUnits("5.", 8)).toBe(500_000_000n)
    expect(parseUnits("00.10", 8)).toBe(10_000_000n)
    expect(parseUnits("007", 8)).toBe(700_000_000n)
    expect(parseUnits("0.0", 8)).toBe(0n)
  })

  it("ignores whitespace around the amount", () => {
    expect(parseUnits("  2  ", 8)).toBe(200_000_000n)
    expect(parseUnits("\t1.5\n", 8)).toBe(150_000_000n)
  })

  it("accepts zeros past the token's decimals, which change nothing", () => {
    expect(parseUnits("1.000000000", 8)).toBe(100_000_000n)
    expect(parseUnits("1.100000000", 8)).toBe(110_000_000n)
    expect(parseUnits("12.000", 0)).toBe(12n)
    expect(parseUnits("1.0", 0)).toBe(1n)
    expect(parseUnits("0.000000000", 8)).toBe(0n)
  })

  it("refuses more significant fraction digits than the token has", () => {
    expect(() => parseUnits("0.123456789", 8)).toThrow(RangeError)
    expect(() => parseUnits("0.123456789", 8)).toThrow(
      /9 fraction digits, more than the token's 8 decimals/
    )
    // The extra digit is the last one, behind zeros.
    expect(() => parseUnits("0.000000001", 8)).toThrow(RangeError)
    expect(() => parseUnits("1.100000001", 8)).toThrow(RangeError)
    expect(() => parseUnits("0.0000000000000000001", 18)).toThrow(RangeError)
    expect(() => parseUnits("1.5", 0)).toThrow(RangeError)
    expect(() => parseUnits("1.5", 0)).toThrow(
      /1 fraction digit, more than the token's 0 decimals/
    )
    // A negative amount is judged by the same rule once it is allowed.
    expect(() => parseUnits("-0.123456789", 8, { signed: true })).toThrow(
      /9 fraction digits/
    )
  })

  it("does not round the digits it refuses", () => {
    // What rounding to the token's digits would have sent instead.
    expect(() => parseUnits("0.123456785", 8)).toThrow(RangeError)
    expect(() => parseUnits("0.999999999", 8)).toThrow(RangeError)
  })

  it("refuses a negative amount unless signed", () => {
    expect(() => parseUnits("-1", 8)).toThrow(RangeError)
    expect(() => parseUnits("-1", 8)).toThrow(/signed/)
    expect(() => parseUnits("-1", 8, {})).toThrow(RangeError)
    expect(() => parseUnits("-1", 8, { signed: false })).toThrow(RangeError)
    expect(() => parseUnits("-0", 8)).toThrow(RangeError)
    expect(() => parseUnits("-.5", 8)).toThrow(RangeError)
    expect(parseUnits("-1", 8, { signed: true })).toBe(-100_000_000n)
    expect(parseUnits("-1.5", 8, { signed: true })).toBe(-150_000_000n)
    expect(parseUnits("-.5", 8, { signed: true })).toBe(-50_000_000n)
    expect(parseUnits("-0.00000001", 8, { signed: true })).toBe(-1n)
    expect(parseUnits("-0", 8, { signed: true })).toBe(0n)
    // Signed takes positive text as it is.
    expect(parseUnits("1.5", 8, { signed: true })).toBe(150_000_000n)
  })

  it("takes signed only as the boolean true", () => {
    expect(() => parseUnits("-1", 8, { signed: "false" as never })).toThrow(
      RangeError
    )
    expect(() => parseUnits("-1", 8, { signed: 1 as never })).toThrow(
      RangeError
    )
    expect(() => parseUnits("-1", 8, null as never)).toThrow(RangeError)
  })

  it.each([
    ["blank text", ""],
    ["whitespace", "   "],
    ["a lone point", "."],
    ["a lone minus", "-"],
    ["a minus and a point", "-."],
    ["grouping", "1,000"],
    ["a comma decimal", "1,5"],
    ["an underscore", "1_000"],
    ["an exponent", "1e3"],
    ["a negative exponent", "1e-8"],
    ["an upper-case exponent", "1E3"],
    ["letters", "abc"],
    ["a unit", "1.5 ICP"],
    ["two points", "1.2.3"],
    ["a leading plus", "+1"],
    ["a plus before a point", "+.5"],
    ["a trailing minus", "1-"],
    ["two minus signs", "--1"],
    ["hex", "0x10"],
    ["binary", "0b1"],
    ["whitespace inside", "1 000"],
    ["a line break inside", "1\n2"],
    ["whitespace after the minus", "- 1"],
    ["non-ASCII digits", "١٢"],
    ["full-width digits", "１２"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
  ])("refuses %s", (_, text) => {
    expect(() => parseUnits(text, 8)).toThrow(TypeError)
    expect(() => parseUnits(text, 8, { signed: true })).toThrow(TypeError)
    expect(() => parseUnits(text, 8)).toThrow(/is not a decimal amount/)
    expect(() => parseUnits(text, 8)).toThrow(/^\[ic-reactor\] parseUnits: /)
  })

  it("refuses what is not text", () => {
    for (const value of [1.5, 1, 10n, undefined, null, {}, ["1"]]) {
      expect(() => parseUnits(value as never, 8)).toThrow(TypeError)
      expect(() => parseUnits(value as never, 8)).toThrow(
        /expected the amount as text/
      )
    }
  })

  it("refuses decimals that are not a whole number from 0 to 255", () => {
    expect(() => parseUnits("1", 8.5)).toThrow(TypeError)
    expect(() => parseUnits("1", NaN)).toThrow(TypeError)
    expect(() => parseUnits("1", Infinity)).toThrow(TypeError)
    expect(() => parseUnits("1", "8" as never)).toThrow(TypeError)
    expect(() => parseUnits("1", 8n as never)).toThrow(TypeError)
    expect(() => parseUnits("1", undefined as never)).toThrow(TypeError)
    expect(() => parseUnits("1", -1)).toThrow(RangeError)
    expect(() => parseUnits("1", 256)).toThrow(RangeError)
    expect(() => parseUnits("1", 1e21)).toThrow(RangeError)
    expect(() => parseUnits("1", 8n as never)).toThrow(/Number\(\)/)
    expect(parseUnits("1", 0)).toBe(1n)
    expect(parseUnits("1", 255)).toBe(10n ** 255n)
    expect(parseUnits(`0.${"0".repeat(254)}1`, 255)).toBe(1n)
  })
})

describe("long input", () => {
  // Text comes from a person, and a paste can be any length. Trimming zeros
  // with /0+$/ retried from every zero of a run, so 200000 of them took
  // seconds; a loop takes well under a millisecond. The bound is loose enough
  // for a loaded machine and far below the quadratic time.
  const elapsed = (run: () => void): number => {
    const start = performance.now()
    run()
    return performance.now() - start
  }

  it("parses a long run of fraction zeros in linear time", () => {
    const text = `0.${"0".repeat(200_000)}1`
    expect(
      elapsed(() => expect(() => parseUnits(text, 8)).toThrow(RangeError))
    ).toBeLessThan(1000)
    const zeros = `1.${"0".repeat(200_000)}`
    let units = 0n
    expect(
      elapsed(() => {
        units = parseUnits(zeros, 8)
      })
    ).toBeLessThan(1000)
    expect(units).toBe(100_000_000n)
  })

  it("shows a whole part of 100000 digits in one pass", () => {
    const value = 10n ** 99_999n
    let text = ""
    expect(
      elapsed(() => {
        text = formatUnits(value, 0)
      })
    ).toBeLessThan(1000)
    // Compared as a boolean: a failing toBe would print both 100k-character
    // strings.
    expect(text === `1${"0".repeat(99_999)}`).toBe(true)
  })

  it("quotes at most 40 characters of what it refused", () => {
    const pasted = `${"1".repeat(10_000)}x`
    let message = ""
    try {
      parseUnits(pasted, 8)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/is not a decimal amount/)
    expect(message).toContain(`"${"1".repeat(39)}…`)
    expect(message.length).toBeLessThan(250)
  })
})

describe("formatUnits", () => {
  it("shows base units as plain decimal text, dropping zeros at the end", () => {
    expect(formatUnits(150_000_000n, 8)).toBe("1.5")
    expect(formatUnits(100_000_000n, 8)).toBe("1")
    expect(formatUnits(1n, 8)).toBe("0.00000001")
    expect(formatUnits(0n, 8)).toBe("0")
    expect(formatUnits(29_000_000n, 8)).toBe("0.29")
    expect(formatUnits(10_000_000n, 8)).toBe("0.1")
    expect(formatUnits(123n, 0)).toBe("123")
    expect(formatUnits(0n, 0)).toBe("0")
  })

  it("is exact past what a Number holds", () => {
    expect(formatUnits(123_456_789_012_345_678_901n, 8)).toBe(
      "1234567890123.45678901"
    )
    expect(formatUnits(9_007_199_254_740_993n, 0)).toBe("9007199254740993")
    expect(formatUnits(1_100_000_000_000_000_000n, 18)).toBe("1.1")
    expect(formatUnits(123_456_789_012_345_678_901_234_567_890n, 18)).toBe(
      "123456789012.34567890123456789"
    )
    expect(formatUnits(10n ** 30n + 1n, 18)).toBe(
      "1000000000000.000000000000000001"
    )
    expect(formatUnits(2n ** 64n, 0)).toBe("18446744073709551616")
  })

  it("writes only a minus, digits and a point", () => {
    for (const value of [
      -1n,
      0n,
      1n,
      123_456_789n,
      -123_456_789n,
      10n ** 30n,
    ]) {
      for (const decimals of [0, 1, 8, 18]) {
        expect(formatUnits(value, decimals)).toMatch(/^-?\d+(\.\d+)?$/)
      }
    }
  })

  it("writes a negative amount with a leading minus", () => {
    expect(formatUnits(-150_000_000n, 8)).toBe("-1.5")
    expect(formatUnits(-1n, 8)).toBe("-0.00000001")
    expect(formatUnits(-100_000_000n, 8)).toBe("-1")
    expect(formatUnits(-5n, 0)).toBe("-5")
  })

  it("never writes -0", () => {
    expect(formatUnits(-0n, 8)).toBe("0")
    // Nothing left to show is not negative.
    expect(formatUnits(-1n, 8, { maxFractionDigits: 2 })).toBe("0")
    expect(formatUnits(-99n, 2, { maxFractionDigits: 0 })).toBe("0")
    expect(
      formatUnits(-1n, 8, { maxFractionDigits: 2, minFractionDigits: 2 })
    ).toBe("0.00")
    expect(formatUnits(-100n, 2, { maxFractionDigits: 1 })).toBe("-1")
  })

  describe("maxFractionDigits", () => {
    it("cuts the digits past it, never showing more than is held", () => {
      expect(formatUnits(99_999_999n, 8, { maxFractionDigits: 2 })).toBe("0.99")
      expect(formatUnits(123_456_789n, 8, { maxFractionDigits: 4 })).toBe(
        "1.2345"
      )
      expect(formatUnits(123_456_789n, 8, { maxFractionDigits: 0 })).toBe("1")
      expect(formatUnits(199_999_999n, 8, { maxFractionDigits: 0 })).toBe("1")
      expect(formatUnits(99_999_999n, 8, { maxFractionDigits: 0 })).toBe("0")
    })

    it("cuts a negative amount toward zero", () => {
      expect(formatUnits(-199_999_999n, 8, { maxFractionDigits: 2 })).toBe(
        "-1.99"
      )
      expect(formatUnits(-199_999_999n, 8, { maxFractionDigits: 0 })).toBe("-1")
      expect(formatUnits(-125n, 2, { maxFractionDigits: 1 })).toBe("-1.2")
    })

    it("drops the zeros the cut leaves at the end", () => {
      expect(formatUnits(100_500_000n, 8, { maxFractionDigits: 2 })).toBe("1")
      expect(formatUnits(110_500_000n, 8, { maxFractionDigits: 2 })).toBe("1.1")
    })

    it("shows the amount exactly when it is at least the token's decimals", () => {
      expect(formatUnits(150_000_000n, 8, { maxFractionDigits: 12 })).toBe(
        "1.5"
      )
      expect(formatUnits(123_456_789n, 8, { maxFractionDigits: 255 })).toBe(
        "1.23456789"
      )
      expect(formatUnits(7n, 0, { maxFractionDigits: 3 })).toBe("7")
    })
  })

  describe("minFractionDigits", () => {
    it("pads with zeros up to it", () => {
      expect(formatUnits(100_000_000n, 8, { minFractionDigits: 2 })).toBe(
        "1.00"
      )
      expect(formatUnits(150_000_000n, 8, { minFractionDigits: 2 })).toBe(
        "1.50"
      )
      expect(formatUnits(0n, 8, { minFractionDigits: 2 })).toBe("0.00")
      expect(formatUnits(-150_000_000n, 8, { minFractionDigits: 2 })).toBe(
        "-1.50"
      )
    })

    it("trims only down to it, and never cuts a digit that is held", () => {
      expect(formatUnits(120_000_000n, 8, { minFractionDigits: 1 })).toBe("1.2")
      expect(formatUnits(120_000_000n, 8, { minFractionDigits: 4 })).toBe(
        "1.2000"
      )
      expect(formatUnits(123_456_789n, 8, { minFractionDigits: 2 })).toBe(
        "1.23456789"
      )
      expect(formatUnits(100_000_000n, 8, { minFractionDigits: 8 })).toBe(
        "1.00000000"
      )
    })

    it("pads past the token's own digits, which a reader takes back as the same amount", () => {
      expect(formatUnits(5n, 0, { minFractionDigits: 2 })).toBe("5.00")
      expect(formatUnits(125n, 2, { minFractionDigits: 4 })).toBe("1.2500")
      expect(parseUnits("1.2500", 2)).toBe(125n)
    })

    it("pads to the same digits it caps at when both are given", () => {
      expect(
        formatUnits(100_000_000n, 8, {
          minFractionDigits: 2,
          maxFractionDigits: 2,
        })
      ).toBe("1.00")
      expect(
        formatUnits(123_456_789n, 8, {
          minFractionDigits: 2,
          maxFractionDigits: 2,
        })
      ).toBe("1.23")
      expect(
        formatUnits(100_000_000n, 8, {
          minFractionDigits: 0,
          maxFractionDigits: 0,
        })
      ).toBe("1")
    })
  })

  it("refuses what is not an amount in base units", () => {
    for (const value of [
      1,
      1.5,
      2 ** 53,
      "150000000",
      "1.5",
      "",
      null,
      undefined,
    ]) {
      expect(() => formatUnits(value as never, 8)).toThrow(TypeError)
      expect(() => formatUnits(value as never, 8)).toThrow(/as a bigint/)
      expect(() => formatUnits(value as never, 8)).toThrow(
        /^\[ic-reactor\] formatUnits: /
      )
    }
    expect(() => formatUnits("1.5" as never, 8)).toThrow(/parseUnits/)
  })

  it("refuses decimals that are not a whole number from 0 to 255", () => {
    expect(() => formatUnits(1n, 1.5)).toThrow(TypeError)
    expect(() => formatUnits(1n, NaN)).toThrow(TypeError)
    expect(() => formatUnits(1n, Infinity)).toThrow(TypeError)
    expect(() => formatUnits(1n, "8" as never)).toThrow(TypeError)
    expect(() => formatUnits(1n, 8n as never)).toThrow(TypeError)
    expect(() => formatUnits(1n, undefined as never)).toThrow(TypeError)
    expect(() => formatUnits(1n, -1)).toThrow(RangeError)
    expect(() => formatUnits(1n, 256)).toThrow(RangeError)
    expect(formatUnits(1n, 255)).toBe(`0.${"0".repeat(254)}1`)
    expect(formatUnits(10n ** 255n, 255)).toBe("1")
  })

  it("refuses digit options it cannot honour", () => {
    expect(() =>
      formatUnits(1n, 8, { minFractionDigits: 4, maxFractionDigits: 2 })
    ).toThrow(RangeError)
    expect(() =>
      formatUnits(1n, 8, { minFractionDigits: 4, maxFractionDigits: 2 })
    ).toThrow(/minFractionDigits \(4\) is more than maxFractionDigits \(2\)/)
    expect(() => formatUnits(1n, 8, { maxFractionDigits: -1 })).toThrow(
      RangeError
    )
    expect(() => formatUnits(1n, 8, { maxFractionDigits: 256 })).toThrow(
      RangeError
    )
    expect(() => formatUnits(1n, 8, { minFractionDigits: -1 })).toThrow(
      RangeError
    )
    expect(() => formatUnits(1n, 8, { minFractionDigits: 256 })).toThrow(
      RangeError
    )
    expect(() => formatUnits(1n, 8, { minFractionDigits: 0.5 })).toThrow(
      TypeError
    )
    expect(() => formatUnits(1n, 8, { maxFractionDigits: 2.5 })).toThrow(
      TypeError
    )
    expect(() =>
      formatUnits(1n, 8, { maxFractionDigits: "2" as never })
    ).toThrow(TypeError)
    expect(() => formatUnits(1n, 8, { maxFractionDigits: NaN })).toThrow(
      TypeError
    )
    expect(() =>
      formatUnits(1n, 8, { maxFractionDigits: 2n as never })
    ).toThrow(/maxFractionDigits must be a whole number/)
  })

  it("takes an option that is undefined as not given", () => {
    expect(
      formatUnits(150_000_000n, 8, {
        maxFractionDigits: undefined,
        minFractionDigits: undefined,
      })
    ).toBe("1.5")
    expect(formatUnits(150_000_000n, 8, undefined)).toBe("1.5")
  })

  it("defaults the cap to the pad, so a pad past the token's digits holds", () => {
    expect(formatUnits(125n, 2, { minFractionDigits: 3 })).toBe("1.250")
  })
})

describe("formatUnits text handed to Intl.NumberFormat", () => {
  // The way formatUnits' documentation tells an app to add a locale's
  // separators. The Intl types of this package's lib take a number or bigint
  // only, so the text is cast; an app on lib ES2023 casts it to
  // Intl.StringNumericLiteral instead.
  const group = (text: string, options: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat("en-US", options).format(text as never)

  it("keeps every digit when maximumFractionDigits covers them", () => {
    expect(
      group(formatUnits(123_456_789_000n, 8), { maximumFractionDigits: 8 })
    ).toBe("1,234.56789")
    // Past what a Number holds: 22 significant digits.
    expect(
      group(formatUnits(123_456_789_012_345_678_901n, 8), {
        maximumFractionDigits: 8,
      })
    ).toBe("1,234,567,890,123.45678901")
  })

  it("rounds at its default of 3 digits, which is why the option is needed", () => {
    expect(formatUnits(99_999_999n, 8)).toBe("0.99999999")
    expect(group(formatUnits(99_999_999n, 8), {})).toBe("1")
    expect(
      group(formatUnits(99_999_999n, 8), { maximumFractionDigits: 8 })
    ).toBe("0.99999999")
  })

  it("keeps padded zeros only when minimumFractionDigits asks for them", () => {
    const padded = formatUnits(100_000_000n, 8, { minFractionDigits: 2 })
    expect(padded).toBe("1.00")
    expect(group(padded, { maximumFractionDigits: 8 })).toBe("1")
    expect(
      group(padded, { minimumFractionDigits: 2, maximumFractionDigits: 8 })
    ).toBe("1.00")
  })
})

describe("parseUnits and formatUnits", () => {
  // A small deterministic generator, so a failure reproduces.
  let seed = 0x2545f491
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed >>> 0
  }
  /** A bigint of up to `bits` bits, from 32 random bits at a time. */
  const randomBits = (bits: number): bigint => {
    let value = 0n
    for (let at = 0; at < bits; at += 32) {
      value = (value << 32n) | BigInt(next())
    }
    const excess = BigInt(Math.ceil(bits / 32) * 32 - bits)
    return value >> excess
  }
  /** Any size up to 2^130, either sign, and often with zeros at the end. */
  const randomAmount = (decimals: number): bigint => {
    let value = randomBits(1 + (next() % 130))
    if (next() % 4 === 0) value *= 10n ** BigInt(next() % (decimals + 1))
    return next() % 2 === 0 ? value : -value
  }

  it("round-trips 10000 random amounts at every decimals from 0 to 18", () => {
    for (let i = 0; i < 10_000; i++) {
      const decimals = next() % 19
      const value = randomAmount(decimals)
      expect(
        parseUnits(formatUnits(value, decimals), decimals, { signed: true }),
        `${value}@${decimals}`
      ).toBe(value)
    }
  })

  it("round-trips every amount at every decimals from 0 to 18, small and large", () => {
    for (let decimals = 0; decimals <= 18; decimals++) {
      const unit = 10n ** BigInt(decimals)
      for (const value of [
        0n,
        1n,
        unit - 1n,
        unit,
        unit + 1n,
        10n * unit,
        2n ** 64n - 1n,
        2n ** 64n,
        2n ** 130n,
      ]) {
        for (const amount of [value, -value]) {
          expect(
            parseUnits(formatUnits(amount, decimals), decimals, {
              signed: true,
            }),
            `${amount}@${decimals}`
          ).toBe(amount)
        }
      }
    }
  })

  it("round-trips through the padded and cut forms that hold every digit", () => {
    for (let i = 0; i < 2_000; i++) {
      const decimals = next() % 19
      const value = randomAmount(decimals)
      const padded = formatUnits(value, decimals, {
        minFractionDigits: next() % 30,
      })
      expect(parseUnits(padded, decimals, { signed: true })).toBe(value)
      const roomy = formatUnits(value, decimals, { maxFractionDigits: 255 })
      expect(parseUnits(roomy, decimals, { signed: true })).toBe(value)
    }
  })

  it("reads back the text it shows, and shows the text it reads", () => {
    for (const text of ["0", "1", "0.29", "1.5", "0.00000001", "12345678.9"]) {
      expect(formatUnits(parseUnits(text, 8), 8)).toBe(text)
    }
    for (let i = 0; i < 2_000; i++) {
      const decimals = 1 + (next() % 18)
      const whole = randomBits(1 + (next() % 100)).toString()
      const digits = 1 + (next() % decimals)
      let fraction = ""
      for (let at = 0; at < digits; at++) fraction += String(next() % 10)
      // Text with no zero at the end of the fraction is the form shown.
      fraction = fraction.replace(/0+$/, "")
      const text = fraction ? `${whole}.${fraction}` : whole
      expect(formatUnits(parseUnits(text, decimals), decimals)).toBe(text)
    }
  })
})
