import { describe, expect, it } from "vitest"
import {
  formatByteSize,
  formatNanos,
  formatTokens,
  groupDigits,
  shortPrincipal,
} from "./format.ts"

describe("groupDigits", () => {
  it("groups bigints and integers in threes", () => {
    expect(groupDigits(0n)).toBe("0")
    expect(groupDigits(999n)).toBe("999")
    expect(groupDigits(1000n)).toBe("1,000")
    expect(groupDigits(1234567n)).toBe("1,234,567")
    expect(groupDigits(-1234567n)).toBe("-1,234,567")
    expect(groupDigits(2n ** 64n - 1n)).toBe("18,446,744,073,709,551,615")
    expect(groupDigits(4_294_967_295)).toBe("4,294,967,295")
    expect(groupDigits(-12)).toBe("-12")
  })

  it("groups only the integer part of other numbers", () => {
    expect(groupDigits(1234.5)).toBe("1,234.5")
    expect(groupDigits(-0.25)).toBe("-0.25")
    expect(groupDigits(1e21)).toBe("1e+21")
    expect(groupDigits(Number.NaN)).toBe("NaN")
    expect(groupDigits(Number.NEGATIVE_INFINITY)).toBe("-Infinity")
  })
})

describe("shortPrincipal", () => {
  it("keeps the first and last groups", () => {
    expect(shortPrincipal("ryjl3-tyaaa-aaaaa-aaaba-cai")).toBe("ryjl3-…-cai")
    expect(
      shortPrincipal(
        "4twgc-viha4-dqoby-ha4dq-obyha-4dqob-yha4d-qobyh-a4dqo-byha4-dqe"
      )
    ).toBe("4twgc-…-dqe")
  })

  it("returns short text whole", () => {
    expect(shortPrincipal("2vxsx-fae")).toBe("2vxsx-fae")
    expect(shortPrincipal("aaaaa-aa")).toBe("aaaaa-aa")
    expect(shortPrincipal("")).toBe("")
  })
})

describe("formatTokens", () => {
  it("formats base units exactly, grouped, with the symbol", () => {
    expect(formatTokens(123_456_789_000n, 8, "ICP")).toBe("1,234.56789 ICP")
    expect(formatTokens(10_000n, 8, "ICP")).toBe("0.0001 ICP")
    expect(formatTokens(0n, 8)).toBe("0")
    expect(formatTokens(-1n, 8)).toBe("-0.00000001")
    expect(formatTokens(1234n * 10n ** 18n + 1n, 18, "ckETH")).toBe(
      "1,234.000000000000000001 ckETH"
    )
    expect(formatTokens(5n, 0, "")).toBe("5")
  })
})

describe("formatNanos", () => {
  it("formats the epoch and fractions to ms, µs or ns", () => {
    expect(formatNanos(0n)).toBe("1970-01-01 00:00:00 UTC")
    expect(formatNanos(1_700_000_000_123_000_000n)).toBe(
      "2023-11-14 22:13:20.123 UTC"
    )
    expect(formatNanos(1_700_000_000_123_456_000n)).toBe(
      "2023-11-14 22:13:20.123456 UTC"
    )
    expect(formatNanos(1_700_000_000_000_000_001n)).toBe(
      "2023-11-14 22:13:20.000000001 UTC"
    )
  })

  it("handles leap days, times before the epoch and the nat64 maximum", () => {
    expect(formatNanos(951_782_400n * 1_000_000_000n)).toBe(
      "2000-02-29 00:00:00 UTC"
    )
    expect(formatNanos(-1n)).toBe("1969-12-31 23:59:59.999999999 UTC")
    expect(formatNanos(2n ** 64n - 1n)).toBe(
      "2554-07-21 23:34:33.709551615 UTC"
    )
  })

  it("agrees with Date for whole milliseconds across four centuries", () => {
    // Test-only use of Date: formatNanos itself never reads it.
    const start = -2_208_988_800_000 // 1900-01-01
    const step = 7_777_777_777_777 // about 246 years in ms, never round
    for (let ms = start; ms < 10_000_000_000_000; ms += step / 61) {
      const whole = Math.floor(ms)
      const iso = new Date(whole).toISOString() // YYYY-MM-DDTHH:MM:SS.sssZ
      const expected = `${iso.slice(0, 10)} ${iso.slice(11, 19)}${
        iso.slice(19, 23) === ".000" ? "" : iso.slice(19, 23)
      } UTC`
      expect(formatNanos(BigInt(whole) * 1_000_000n)).toBe(expected)
    }
  })
})

describe("formatByteSize", () => {
  it("uses B, KiB and MiB", () => {
    expect(formatByteSize(0)).toBe("0 B")
    expect(formatByteSize(73)).toBe("73 B")
    expect(formatByteSize(16 * 1024)).toBe("16.0 KiB")
    expect(formatByteSize(1_891_788)).toBe("1.8 MiB")
  })
})
