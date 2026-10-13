// Conversions behind the field widgets: token units, timestamps and
// subaccounts. Pure and deterministic, except `nowNanos`, which reads the
// clock and is called only from event handlers and effects, never in render.
import { formatUnits, parseUnits } from "@ic-reactor/core"
import { formatNanos, type TokenUnits } from "../lib/format.ts"
import { fromHex } from "../lib/hex.ts"
import { parseBigInt } from "./engine.ts"

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

// ic-reactor's messages name the function they come from; a field already
// says what it is.
const PREFIX = /^\[ic-reactor\] (?:parseUnits|formatUnits): /

/**
 * A decimal amount in a token's units as base units, exactly: "1.5" with 8
 * decimals is 150000000n. More fraction digits than the token has, grouping
 * separators and exponents are refused, never rounded (`parseUnits`).
 */
export function parseTokenAmount(
  text: string,
  units: TokenUnits,
  signed = false
): Parsed<bigint> {
  if (text.trim() === "") return { ok: false, message: "required" }
  try {
    return { ok: true, value: parseUnits(text, units.decimals, { signed }) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: message.replace(PREFIX, "") }
  }
}

/**
 * Base-units text (a leaf draft) as a decimal in the token's units, or
 * `undefined` when the text is not a whole number. It reads the text as the
 * engine does (`1,000,000`, `0x5f5e100`), so the decimal shown is the amount
 * the call sends, never the raw text beside the token's symbol.
 */
export function tokenAmountText(
  raw: string,
  units: TokenUnits
): string | undefined {
  const value = parseBigInt(raw)
  return typeof value === "bigint"
    ? formatUnits(value, units.decimals)
    : undefined
}

/** Now, in nanoseconds since the Unix epoch. Event handlers and effects only. */
export function nowNanos(): bigint {
  return BigInt(Date.now()) * 1_000_000n
}

const NANOS_PER_MILLI = 1_000_000n
const UTC_TEXT =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))? UTC$/

/**
 * Nanoseconds as the value of an `<input type="datetime-local">` read as
 * UTC ("2026-10-12T02:31:05.123"), or `undefined` outside years 0000–9999.
 * Computed from the bigint, so it is the same on the server and in every
 * browser, whatever their time zone.
 */
export function nanosToUtcInput(ns: bigint): string | undefined {
  const match = UTC_TEXT.exec(formatNanos(ns))
  if (match === null) return undefined
  const [, y, mo, d, h, mi, s, fraction = ""] = match
  const millis = fraction.padEnd(3, "0").slice(0, 3)
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${millis === "000" ? "" : `.${millis}`}`
}

const INPUT_TEXT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

/** A `datetime-local` value read as UTC, in nanoseconds; `undefined` if malformed. */
export function utcInputToNanos(text: string): bigint | undefined {
  const match = INPUT_TEXT.exec(text)
  if (match === null) return undefined
  const [, y, mo, d, h, mi, s = "0", ms = "0"] = match
  const parts = [y, mo, d, h, mi, s, ms.padEnd(3, "0")].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const [year, month, day, hour, minute, second, milli] = parts
  // Not Date.UTC: it reads years 0-99 as 1900-1999. The setters take the
  // year as given, and the round trip refuses a day or time that rolls
  // over (February 30, 24:00).
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, milli)
  const millis = date.getTime()
  if (
    !Number.isFinite(millis) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return undefined
  }
  return BigInt(millis) * NANOS_PER_MILLI
}

/** The bytes of a subaccount. */
export const SUBACCOUNT_BYTES = 32

/**
 * A subaccount from a number: 32 bytes, big-endian, the convention ledgers
 * and wallets use for "subaccount 1, 2, …".
 */
export function subaccountFromNumber(text: string): Parsed<Uint8Array> {
  // The engine's reading: "1,5" is refused, not taken for subaccount 15.
  const n = parseBigInt(text)
  if (typeof n === "string" || n < 0n)
    return { ok: false, message: "enter a whole number ≥ 0" }
  const hex = n.toString(16).padStart(SUBACCOUNT_BYTES * 2, "0")
  const bytes = hex.length === SUBACCOUNT_BYTES * 2 ? fromHex(hex) : undefined
  if (bytes === undefined)
    return { ok: false, message: "too large for 32 bytes" }
  return { ok: true, value: bytes }
}
