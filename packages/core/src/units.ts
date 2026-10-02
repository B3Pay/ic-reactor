/**
 * Exact conversions between a token's base units (e8s, satoshis, wei) and the
 * decimal text a person reads and types.
 *
 * A ledger counts in base units as a `nat`, which a generated module returns
 * as a `bigint`. Going through `Number` loses digits:
 * `Math.floor(Number("0.29") * 10 ** 8)` is `28999999`, so a transfer of 0.29
 * sends 0.28999999, and at 18 decimals `1.1` becomes `1100000000000000128`.
 * These helpers work on the digits instead, so every amount a ledger can hold
 * converts exactly in both directions, and what cannot be represented is
 * refused rather than rounded: a transfer never sends something other than
 * what was typed.
 */

/** The most decimals, and fraction digits, accepted: `icrc1_decimals` is a `nat8`. */
const MAX_DIGITS = 255

/** The most characters of a refused value an error message quotes. */
const MAX_SHOWN = 40

/**
 * How a value is quoted in an error message. A form may show the message, and
 * what was typed or pasted can be any length, so a long value is cut.
 */
const show = (value: unknown): string => {
  const text =
    typeof value === "string"
      ? JSON.stringify(value)
      : typeof value === "bigint"
        ? `${value}n`
        : String(value)
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text
}

/**
 * `digits` without the zeros at its end. A loop rather than `/0+$/`, which
 * retries from every zero of a long run and so takes quadratic time on text
 * such as `"0.000…0001"`.
 */
const withoutTrailingZeros = (digits: string): string => {
  let end = digits.length
  while (end > 0 && digits.charCodeAt(end - 1) === 48) end--
  return digits.slice(0, end)
}

/**
 * A count from 0 to 255: `decimals` or a fraction-digit option. Not a whole
 * number is a `TypeError` (the wrong kind of value, such as a `bigint`, text
 * or `8.5`); a whole number outside the range is a `RangeError`.
 */
const toCount = (value: unknown, name: string, fn: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(
      `[ic-reactor] ${fn}: ${name} must be a whole number from 0 to ${MAX_DIGITS} (a number, as icrc1_decimals returns; convert a bigint with Number()), got ${show(value)}`
    )
  }
  if (value < 0 || value > MAX_DIGITS) {
    throw new RangeError(
      `[ic-reactor] ${fn}: ${name} must be from 0 to ${MAX_DIGITS}, got ${show(value)}`
    )
  }
  return value
}

/**
 * `-`, then whole digits, then a `.` and fraction digits, either part may be
 * empty: `"5"`, `"5."`, `".5"`, `"-1.25"`. `\d` is the ASCII digits only.
 */
const DECIMAL_TEXT = /^(-)?(\d*)(?:\.(\d*))?$/

/**
 * Read a decimal amount a person typed, such as `"1.5"`, as the token's base
 * units, exactly.
 *
 * The text is digits with at most one `.`; whitespace around it is ignored,
 * and `"5."` and `".5"` are accepted. Anything else is refused rather than
 * guessed at: grouping separators (`"1,5"` means 1.5 in one locale and 15 in
 * another), exponents (`"1e-8"`), a leading `+`, a lone `.`, whitespace
 * inside the number, and any other character. More fraction digits than
 * `decimals` are refused too, unless the extra ones are all zeros: 0.1 at
 * 8 decimals is `10000000n`, but `"0.123456789"` is no amount of e8s, and
 * rounding it would send something other than what was typed.
 *
 * There is no upper bound on the result. A `nat64` field in a generated
 * module refuses 2^64 when the call is encoded, before anything is sent, and
 * an ICRC-1 `amount` is a `nat`, which has no bound; the limit belongs to the
 * Candid type, not to the conversion.
 *
 * @param text - The decimal amount, as a person types it.
 * @param decimals - The token's decimals, a whole number from 0 to 255, as
 * `icrc1_decimals` returns them.
 * @param options - `signed: true` accepts a leading `-`, for an `int` amount.
 * It defaults to `false`: a ledger's amounts are `nat`, so a negative amount
 * is refused here instead of failing later when the call is encoded.
 * @returns The amount in base units: `150000000n` for `"1.5"` at 8 decimals.
 * @throws TypeError when `text` is not text or not a decimal amount (blank,
 * letters, grouping, an exponent, a `+`, a lone `.`, inner whitespace), or
 * `decimals` is not a whole number.
 * @throws RangeError when `text` has more significant fraction digits than
 * `decimals`, is negative without `signed`, or `decimals` is outside 0-255.
 *
 * @example
 * ```ts
 * import { parseUnits } from "@ic-reactor/core"
 *
 * parseUnits("0.29", 8) // 29000000n (Number math gives 28999999)
 * parseUnits("1.1", 18) // 1100000000000000000n
 * parseUnits("1.000000000", 8) // 100000000n: the extra zeros change nothing
 * parseUnits("0.123456789", 8) // throws RangeError: 9 fraction digits
 * parseUnits("-1", 8) // throws RangeError: negative
 * parseUnits("-1", 8, { signed: true }) // -100000000n
 * parseUnits("1e3", 8) // throws TypeError: no exponents
 *
 * // In a form: show the message and send nothing, or send the exact amount
 * const onSubmit = () => {
 *   let amount: bigint
 *   try {
 *     amount = parseUnits(input, decimals)
 *   } catch (error) {
 *     setAmountError((error as Error).message)
 *     return
 *   }
 *   transfer({ to: { owner }, amount })
 * }
 * ```
 */
export function parseUnits(
  text: string,
  decimals: number,
  options?: { signed?: boolean }
): bigint {
  if (typeof text !== "string") {
    throw new TypeError(
      `[ic-reactor] parseUnits: expected the amount as text such as "1.5", got ${show(text)}`
    )
  }
  const scale = toCount(decimals, "decimals", "parseUnits")
  const match = DECIMAL_TEXT.exec(text.trim())
  if (!match || (!match[2] && !match[3])) {
    throw new TypeError(
      `[ic-reactor] parseUnits: ${show(text)} is not a decimal amount; write digits with at most one "." (such as "1.5"), without grouping separators, an exponent or a "+"`
    )
  }
  const [, minus, whole, fraction = ""] = match
  if (minus && options?.signed !== true) {
    throw new RangeError(
      `[ic-reactor] parseUnits: ${show(text)} is negative; pass { signed: true } to accept a negative amount`
    )
  }
  // Zeros past the token's digits change nothing, so only the rest count.
  const significant = withoutTrailingZeros(fraction)
  if (significant.length > scale) {
    throw new RangeError(
      `[ic-reactor] parseUnits: ${show(text)} has ${significant.length} fraction ${significant.length === 1 ? "digit" : "digits"}, more than the token's ${scale} decimals`
    )
  }
  const units = BigInt((whole || "0") + significant.padEnd(scale, "0"))
  return minus ? -units : units
}

/**
 * Show an amount of a token's base units as plain decimal text, exactly.
 *
 * `value` is what a ledger returns, a `bigint`; no digit passes through a
 * JavaScript `Number`, so an 18-decimal balance of any size shows as it is.
 * The text is only `-`, the digits 0-9 and `.`, the same on the server and in
 * every browser, and the form {@link parseUnits} reads back. For a locale's
 * separators or grouping, format that text yourself. `Intl.NumberFormat` reads
 * a decimal string exactly (an engine without Intl.NumberFormat v3 turns it
 * into a `Number` first), but it rounds to 3 fraction digits unless told
 * otherwise, so `"0.99999999"` would show as `"1"`: the overstatement
 * `maxFractionDigits` below prevents. Give it a `maximumFractionDigits` of at
 * least the digits the text has (`decimals` does, up to the 100 Intl allows),
 * and a `minimumFractionDigits` to keep zeros `minFractionDigits` padded.
 *
 * By default every significant fraction digit is shown and zeros at the end
 * are dropped, so one ICP (100000000n at 8 decimals) is `"1"`.
 * `maxFractionDigits` shortens the fraction by cutting the digits past it,
 * toward zero and never rounding, so a balance of 0.99999999 shown to two
 * digits is `"0.99"`: never more than is held. `minFractionDigits` pads the
 * fraction with zeros instead of trimming them, so `2` shows one ICP as
 * `"1.00"`. A negative amount (an `int`) is written with a leading `-`,
 * except where the digits shown are all zero: there is no `"-0"`.
 *
 * `maxFractionDigits` beyond `decimals` shows the amount exactly, as the
 * default does, so one display setting can serve tokens of different
 * decimals. `minFractionDigits` may pad past `decimals`: `"1.2500"` at 2
 * decimals is the same amount, and {@link parseUnits} reads it back.
 *
 * There is no upper bound on `value`. A `nat64` field in a generated module
 * refuses 2^64 when the call is encoded; an ICRC-1 `nat` has no bound.
 *
 * @param value - The amount in base units (e8s for ICP).
 * @param decimals - The token's decimals, a whole number from 0 to 255, as
 * `icrc1_decimals` returns them.
 * @param options - `maxFractionDigits` (default `decimals`, or
 * `minFractionDigits` when that is more) and `minFractionDigits` (default
 * `0`), each a whole number from 0 to 255 with `minFractionDigits` not more
 * than `maxFractionDigits`. Other keys are not read.
 * @returns The amount as decimal text, `"1.5"` for 150000000n at 8 decimals.
 * @throws TypeError when `value` is not a `bigint`, or `decimals` or a digit
 * option is not a whole number.
 * @throws RangeError when `decimals` or a digit option is outside 0-255, or
 * `minFractionDigits` is more than `maxFractionDigits`.
 *
 * @example
 * ```ts
 * import { formatUnits } from "@ic-reactor/core"
 *
 * formatUnits(150_000_000n, 8) // "1.5"
 * formatUnits(123_456_789n, 8, { maxFractionDigits: 2 }) // "1.23"
 * formatUnits(99_999_999n, 8, { maxFractionDigits: 2 }) // "0.99", never "1"
 * formatUnits(100_000_000n, 8, { minFractionDigits: 2 }) // "1.00"
 * formatUnits(-1n, 8) // "-0.00000001"
 *
 * // A locale's separators are the app's to add, over the plain text.
 * // maximumFractionDigits stops Intl rounding to its default 3 digits.
 * // The cast is for lib ES2023 or later (es2023.intl): before it, the Intl
 * // types accept a number or bigint only, and a number loses digits.
 * const text = formatUnits(123_456_789_000n, 8) // "1234.56789"
 * new Intl.NumberFormat("de-DE", { maximumFractionDigits: 8 }).format(
 *   text as Intl.StringNumericLiteral
 * ) // "1.234,56789"
 * ```
 */
export function formatUnits(
  value: bigint,
  decimals: number,
  options?: { maxFractionDigits?: number; minFractionDigits?: number }
): string {
  if (typeof value !== "bigint") {
    throw new TypeError(
      `[ic-reactor] formatUnits: expected an amount in base units as a bigint, got ${show(value)}. Read decimal text such as "1.5" with parseUnits.`
    )
  }
  const scale = toCount(decimals, "decimals", "formatUnits")
  const min =
    options?.minFractionDigits === undefined
      ? 0
      : toCount(options.minFractionDigits, "minFractionDigits", "formatUnits")
  const max =
    options?.maxFractionDigits === undefined
      ? Math.max(scale, min)
      : toCount(options.maxFractionDigits, "maxFractionDigits", "formatUnits")
  if (min > max) {
    throw new RangeError(
      `[ic-reactor] formatUnits: minFractionDigits (${min}) is more than maxFractionDigits (${max})`
    )
  }

  const negative = value < 0n
  const magnitude = negative ? -value : value
  const unit = 10n ** BigInt(scale)
  const whole = magnitude / unit
  // The fraction as its `scale` digits, cut to the `max` shown: truncation, so
  // nothing past it carries into the digits that remain.
  const shown =
    scale > 0
      ? (magnitude % unit).toString().padStart(scale, "0").slice(0, max)
      : ""
  const significant = withoutTrailingZeros(shown)
  const fraction = significant.padEnd(min, "0")
  const text = fraction ? `${whole}.${fraction}` : `${whole}`
  // Nothing shown but zeros is not negative: -0.001 to two digits is "0".
  return negative && (whole !== 0n || significant !== "") ? `-${text}` : text
}
