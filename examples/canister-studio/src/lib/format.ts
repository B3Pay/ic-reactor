import { formatUnits } from "@ic-reactor/core"

// Everything here is deterministic text: the same input gives the same output
// on the server and in every browser. Never `toLocaleString` or `Intl`: the
// server's locale and time zone are not the reader's, and a render that
// differs between the two is a hydration mismatch.

/**
 * How a ledger's base units read as tokens: `icrc1_decimals` and
 * `icrc1_symbol`. Forms edit such amounts as decimals (`parseUnits`), viewers
 * show them with `formatTokens`.
 */
export interface TokenUnits {
  readonly decimals: number
  readonly symbol: string
}

/** Comma groups of three in a string of decimal digits (no sign, no point). */
function groupIntegerDigits(digits: string): string {
  let out = ""
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ","
    out += digits[i]
  }
  return out
}

/** Groups the integer part of plain decimal text: "-1234.5" → "-1,234.5". */
function groupDecimalText(text: string): string {
  const negative = text.startsWith("-")
  const unsigned = negative ? text.slice(1) : text
  const point = unsigned.indexOf(".")
  const integer = point === -1 ? unsigned : unsigned.slice(0, point)
  const fraction = point === -1 ? "" : unsigned.slice(point)
  return `${negative ? "-" : ""}${groupIntegerDigits(integer)}${fraction}`
}

/**
 * An integer with comma groups of three: `1234567n` → "1,234,567". A
 * non-integer number groups its integer part; a number JavaScript writes in
 * exponent form, `NaN` and the infinities are returned as JavaScript writes
 * them.
 */
export function groupDigits(n: bigint | number): string {
  if (typeof n === "bigint") return groupDecimalText(n.toString())
  const text = String(n)
  if (!Number.isFinite(n) || /e/i.test(text)) return text
  return groupDecimalText(text)
}

/**
 * Principal text cut to its first and last groups: "ryjl3-…-cai". Text with
 * fewer than three groups (the anonymous principal "2vxsx-fae") is returned
 * whole.
 */
export function shortPrincipal(text: string): string {
  const groups = text.split("-")
  if (groups.length < 3) return text
  return `${groups[0]}-…-${groups[groups.length - 1]}`
}

/**
 * A token amount in base units as grouped decimal text, with the symbol when
 * given: `123456789000n, 8, "ICP"` → "1,234.56789 ICP". Exact (bigint all the
 * way, through `formatUnits`); trailing zeros of the fraction are dropped.
 */
export function formatTokens(
  units: bigint,
  decimals: number,
  symbol?: string
): string {
  const amount = groupDecimalText(formatUnits(units, decimals))
  return symbol === undefined || symbol === "" ? amount : `${amount} ${symbol}`
}

// Floor division by a positive bigint (`/` truncates toward zero, so a
// negative dividend with a remainder rounds one step further down).
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b
  return a % b < 0n ? q - 1n : q
}

const pad = (n: bigint, width: number): string =>
  n.toString().padStart(width, "0")

const NANOS_PER_SECOND = 1_000_000_000n
const SECONDS_PER_DAY = 86_400n

/**
 * Nanoseconds since the Unix epoch (an IC timestamp, `created_at_time`) as a
 * UTC date and time: "2026-10-12 02:31:05.123456789 UTC". The fraction is
 * shown to the millisecond, microsecond or nanosecond, as far as it has
 * digits, and left out when it is zero. Computed in bigint, so any nat64 or
 * int64 is exact and nothing depends on the host's clock or time zone.
 */
export function formatNanos(ns: bigint): string {
  const seconds = floorDiv(ns, NANOS_PER_SECOND)
  const nanos = ns - seconds * NANOS_PER_SECOND
  const days = floorDiv(seconds, SECONDS_PER_DAY)
  const secondOfDay = seconds - days * SECONDS_PER_DAY

  // Days to a proleptic Gregorian date (Howard Hinnant's civil_from_days).
  const z = days + 719_468n
  const era = floorDiv(z, 146_097n)
  const dayOfEra = z - era * 146_097n
  const yearOfEra =
    (dayOfEra - dayOfEra / 1_460n + dayOfEra / 36_524n - dayOfEra / 146_096n) /
    365n
  const dayOfYear =
    dayOfEra - (365n * yearOfEra + yearOfEra / 4n - yearOfEra / 100n)
  const mp = (5n * dayOfYear + 2n) / 153n
  const day = dayOfYear - (153n * mp + 2n) / 5n + 1n
  const month = mp < 10n ? mp + 3n : mp - 9n
  const year = yearOfEra + era * 400n + (month <= 2n ? 1n : 0n)

  const hour = secondOfDay / 3_600n
  const minute = (secondOfDay % 3_600n) / 60n
  const second = secondOfDay % 60n

  let fraction = ""
  if (nanos !== 0n) {
    fraction = `.${pad(nanos, 9)}`
    if (fraction.endsWith("000000")) fraction = fraction.slice(0, 4)
    else if (fraction.endsWith("000")) fraction = fraction.slice(0, 7)
  }

  const yearText = year < 0n ? `-${pad(-year, 4)}` : pad(year, 4)
  return `${yearText}-${pad(month, 2)}-${pad(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}${fraction} UTC`
}

/**
 * A byte count for people: "73 B", "16.0 KiB", "1.9 MiB". One decimal above
 * a kibibyte (`toFixed`, which is not locale-dependent).
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
