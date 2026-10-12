// Conversions behind the field widgets: token units, timestamps and
// subaccounts. Pure and deterministic, except `nowNanos`, which reads the
// clock and is called only from event handlers and effects, never in render.
import { formatUnits, parseUnits } from "@ic-reactor/core"
import { formatNanos, type TokenUnits } from "../lib/format.ts"
import { fromHex } from "../lib/hex.ts"

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
 * `undefined` when the text is not a whole number.
 */
export function tokenAmountText(
  raw: string,
  units: TokenUnits
): string | undefined {
  const t = raw.trim()
  if (!/^-?\d+$/.test(t)) return undefined
  return formatUnits(BigInt(t), units.decimals)
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
  const millis = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    Number(ms.padEnd(3, "0"))
  )
  if (!Number.isFinite(millis)) return undefined
  return BigInt(millis) * NANOS_PER_MILLI
}

/** The bytes of a subaccount. */
export const SUBACCOUNT_BYTES = 32

/**
 * A subaccount from a number: 32 bytes, big-endian, the convention ledgers
 * and wallets use for "subaccount 1, 2, …".
 */
export function subaccountFromNumber(text: string): Parsed<Uint8Array> {
  const t = text.trim().replace(/[_,\s]/g, "")
  if (!/^\d+$/.test(t))
    return { ok: false, message: "enter a whole number ≥ 0" }
  const hex = BigInt(t)
    .toString(16)
    .padStart(SUBACCOUNT_BYTES * 2, "0")
  const bytes = hex.length === SUBACCOUNT_BYTES * 2 ? fromHex(hex) : undefined
  if (bytes === undefined)
    return { ok: false, message: "too large for 32 bytes" }
  return { ok: true, value: bytes }
}

/** The number of UTF-8 bytes of a text. */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}
