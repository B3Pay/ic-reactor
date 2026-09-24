/**
 * Exact conversions between a token's base units (e8s, satoshis, wei) and the
 * decimal text a person reads and types.
 *
 * A ledger counts in base units as a `nat`, which a `Reactor` returns as a
 * `bigint` and a `DisplayReactor` as its decimal text. Going through `Number`
 * loses digits: `Math.floor(Number("0.29") * 10 ** 8)` is `28999999`, so a
 * transfer of 0.29 sends 0.28999999, and at 18 decimals `1.1` becomes
 * `1100000000000000128`. These helpers work on the digits instead, so every
 * amount a ledger can hold converts exactly in both directions.
 */

/** The most decimals, and fraction digits, these helpers accept: a `nat8`. */
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

/** A token's decimals as a count from 0 to 255, or an error naming `fn`. */
const toDecimals = (decimals: unknown, fn: string): number => {
  // A bigint or digit text is whole however large; past what a Number holds
  // it becomes Infinity, which the range check below refuses.
  const count =
    typeof decimals === "bigint" ||
    (typeof decimals === "string" && /^\d+$/.test(decimals))
      ? Number(decimals)
      : typeof decimals === "number" && Number.isInteger(decimals)
        ? decimals
        : undefined
  if (count === undefined) {
    throw new TypeError(
      `[ic-reactor] ${fn}: decimals must be a whole number (a number, bigint or digit string such as icrc1_decimals returns), got ${show(decimals)}`
    )
  }
  if (count < 0 || count > MAX_DIGITS) {
    throw new RangeError(
      `[ic-reactor] ${fn}: decimals must be from 0 to ${MAX_DIGITS}, got ${show(decimals)}`
    )
  }
  return count
}

/** A fraction-digit option as a count from 0 to 255. */
const toDigitCount = (
  value: number | undefined,
  name: string,
  fallback: number
): number => {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 0 || value > MAX_DIGITS) {
    throw new RangeError(
      `[ic-reactor] formatTokenAmount: ${name} must be a whole number from 0 to ${MAX_DIGITS}, got ${show(value)}`
    )
  }
  return value
}

/** An amount in base units as a bigint. */
const toBaseUnits = (value: unknown): bigint => {
  if (typeof value === "bigint") return value
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value)
  throw new TypeError(
    `[ic-reactor] formatTokenAmount: expected an amount in base units (a bigint, integer text such as a DisplayReactor returns, or a safe integer), got ${show(value)}. Read decimal text such as "1.5" with parseTokenAmount.`
  )
}

/** Options for {@link formatTokenAmount}. */
export interface FormatTokenAmountOptions {
  /**
   * The most fraction digits to show. Digits past it are dropped as
   * `roundingMode` says. Defaults to the token's `decimals`, which shows the
   * amount exactly, or to `minFractionDigits` when that is more.
   */
  maxFractionDigits?: number
  /**
   * The fewest fraction digits to show, padded with zeros: `2` shows one ICP
   * as `"1.00"`. Defaults to `0`.
   */
  minFractionDigits?: number
  /**
   * Drop zeros at the end of the fraction, down to `minFractionDigits`.
   * Defaults to `true`, so one ICP shows as `"1"`. With `false` the fraction
   * is padded to `maxFractionDigits`: `"1.00000000"`.
   */
  trimTrailingZeros?: boolean
  /**
   * How digits past `maxFractionDigits` are dropped. `"trunc"` (the default)
   * cuts them, so a balance of 0.99999999 shown to two digits is `"0.99"`,
   * never more than is held. `"halfExpand"` rounds half away from zero, as
   * `Intl.NumberFormat` does: `"1"`.
   */
  roundingMode?: "trunc" | "halfExpand"
  /**
   * A BCP 47 locale, such as `"de-DE"`, whose decimal separator, grouping and
   * digits to use, through `Intl.NumberFormat`. Without one the text is plain:
   * `-`, the digits 0-9 and `.`, the form {@link parseTokenAmount} reads back,
   * and the same on the server and in every browser.
   */
  locale?: string | readonly string[]
  /**
   * Group the whole part into thousands. Without a `locale` this writes `,`
   * every three digits and defaults to `false`; with one it follows the
   * locale, as `Intl.NumberFormat` does.
   */
  useGrouping?: boolean
}

/** Options for {@link parseTokenAmount}. */
export interface ParseTokenAmountOptions {
  /**
   * Accept a leading `-`, for an `int` amount. Defaults to `false`: a ledger's
   * amounts are `nat`, so a negative amount is refused with a `RangeError`
   * rather than failing later when the call is encoded.
   */
  allowNegative?: boolean
}

/** The separators and digits of one locale and grouping choice. */
interface LocaleStyle {
  whole: Intl.NumberFormat
  decimal: string
  digits: string[]
}

const localeStyles = new Map<string, LocaleStyle>()

const localeStyle = (
  locale: string | readonly string[],
  useGrouping: boolean | undefined
): LocaleStyle => {
  const key = JSON.stringify([locale, useGrouping])
  let style = localeStyles.get(key)
  if (!style) {
    const locales = typeof locale === "string" ? locale : [...locale]
    const whole = new Intl.NumberFormat(locales, { useGrouping })
    const decimal =
      new Intl.NumberFormat(locales)
        .formatToParts(1.5)
        .find((part) => part.type === "decimal")?.value ?? "."
    const digits = Array.from({ length: 10 }, (_, digit) => whole.format(digit))
    style = { whole, decimal, digits }
    // Locales come from the app, so this stays small; the cap only keeps a
    // caller that builds a locale per value from growing it without end.
    if (localeStyles.size >= 32) localeStyles.clear()
    localeStyles.set(key, style)
  }
  return style
}

/** `digits` with a `,` between each group of three from the right. */
const groupThousands = (digits: string): string => {
  let grouped = digits.slice(0, digits.length % 3 || 3)
  for (let at = grouped.length; at < digits.length; at += 3) {
    grouped += `,${digits.slice(at, at + 3)}`
  }
  return grouped
}

/**
 * Show an amount of a token's base units as decimal text, exactly.
 *
 * `value` is what a ledger returns: a `bigint` from a `Reactor`, or the
 * integer text a `DisplayReactor` gives for a `nat`. `decimals` is the
 * token's, as `icrc1_decimals` returns it, in any of those forms. No digit
 * passes through a JavaScript `Number`, so an 18-decimal balance of any size
 * shows as it is.
 *
 * By default every significant fraction digit is shown and zeros at the end
 * are dropped. `maxFractionDigits` shortens the fraction, cutting the rest
 * unless `roundingMode` is `"halfExpand"`; `minFractionDigits` or
 * `trimTrailingZeros: false` pads it. A negative amount (an `int`) is written
 * with a leading `-`, except where the digits shown are all zero.
 *
 * @param value - The amount in base units (e8s for ICP).
 * @param decimals - The token's decimals, from 0 to 255.
 * @param options - Fraction digits, rounding, locale and grouping.
 * @returns The amount as decimal text, `"1.5"` for 150000000 e8s.
 * @throws TypeError when `value` is not an integer amount, or `decimals` is
 * not a whole number.
 * @throws RangeError when `decimals` or a digit option is outside 0-255,
 * `minFractionDigits` exceeds `maxFractionDigits`, `roundingMode` is not one
 * of the two, or `Intl.NumberFormat` refuses `locale`.
 *
 * @example
 * ```ts
 * import { formatTokenAmount } from "@ic-reactor/core"
 *
 * formatTokenAmount(150_000_000n, 8) // "1.5"
 * formatTokenAmount("123456789", 8, { maxFractionDigits: 2 }) // "1.23"
 * formatTokenAmount(100_000_000n, 8, { minFractionDigits: 2 }) // "1.00"
 * formatTokenAmount(123_456_789_000n, 8, { locale: "de-DE" }) // "1.234,56789"
 *
 * // A DisplayReactor returns both as display values
 * const [balance, decimals] = await Promise.all([
 *   ledger.fetchQuery({ functionName: "icrc1_balance_of", args: [{ owner }] }),
 *   ledger.fetchQuery({ functionName: "icrc1_decimals" }),
 * ])
 * formatTokenAmount(balance, decimals, { maxFractionDigits: 4 })
 * ```
 */
export function formatTokenAmount(
  value: bigint | string | number,
  decimals: number | bigint | string,
  options: FormatTokenAmountOptions = {}
): string {
  const units = toBaseUnits(value)
  const scale = toDecimals(decimals, "formatTokenAmount")
  const minDigits = toDigitCount(
    options.minFractionDigits,
    "minFractionDigits",
    0
  )
  const maxDigits = toDigitCount(
    options.maxFractionDigits,
    "maxFractionDigits",
    Math.max(scale, minDigits)
  )
  if (minDigits > maxDigits) {
    throw new RangeError(
      `[ic-reactor] formatTokenAmount: minFractionDigits (${minDigits}) is more than maxFractionDigits (${maxDigits})`
    )
  }
  const roundingMode = options.roundingMode ?? "trunc"
  if (roundingMode !== "trunc" && roundingMode !== "halfExpand") {
    throw new RangeError(
      `[ic-reactor] formatTokenAmount: roundingMode must be "trunc" or "halfExpand", got ${show(roundingMode)}`
    )
  }

  // Scale the magnitude down to the fraction digits kept, then split it.
  const kept = Math.min(maxDigits, scale)
  const dropped = 10n ** BigInt(scale - kept)
  const negative = units < 0n
  let magnitude = negative ? -units : units
  const remainder = magnitude % dropped
  magnitude /= dropped
  if (roundingMode === "halfExpand" && remainder * 2n >= dropped) {
    magnitude += 1n
  }
  const unit = 10n ** BigInt(kept)
  const whole = magnitude / unit
  let fraction =
    kept > 0 ? (magnitude % unit).toString().padStart(kept, "0") : ""
  fraction =
    options.trimTrailingZeros === false
      ? fraction.padEnd(maxDigits, "0")
      : withoutTrailingZeros(fraction).padEnd(minDigits, "0")
  // Nothing shown is not negative: -0.001 to two digits is "0", not "-0".
  const signed = negative && magnitude !== 0n

  if (options.locale === undefined) {
    const digits = whole.toString()
    return (
      (signed ? "-" : "") +
      (options.useGrouping ? groupThousands(digits) : digits) +
      (fraction ? `.${fraction}` : "")
    )
  }

  const style = localeStyle(options.locale, options.useGrouping)
  // Intl writes the sign where the locale puts it. A whole part of 0 has no
  // negative bigint, and not every engine signs the number -0, so it is -1
  // with its one digit swapped for a zero.
  const text = !signed
    ? style.whole.format(whole)
    : whole === 0n
      ? style.whole.format(-1n).replace(style.digits[1], style.digits[0])
      : style.whole.format(-whole)
  if (!fraction) return text
  const localized = fraction.replace(/\d/g, (digit) => style.digits[+digit])
  // The fraction goes after the last digit of the whole part, ahead of
  // anything the locale writes after the number.
  const end = Math.max(
    ...style.digits.map((digit) => {
      const at = text.lastIndexOf(digit)
      return at < 0 ? 0 : at + digit.length
    })
  )
  return text.slice(0, end) + style.decimal + localized + text.slice(end)
}

/**
 * `-`, then whole digits, then a `.` and fraction digits, either part may be
 * empty: `"5"`, `"5."`, `".5"`, `"-1.25"`.
 */
const DECIMAL_TEXT = /^(-)?(\d*)(?:\.(\d*))?$/

/**
 * Read a decimal amount a person typed, such as `"1.5"`, as the token's base
 * units, exactly.
 *
 * The text is digits with at most one `.`, and may be surrounded by
 * whitespace; `"5."` and `".5"` are accepted. Grouping separators, exponents
 * (`"1e-8"`) and any other character are refused rather than guessed at, since
 * `"1,5"` means 1.5 in one locale and 15 in another. More fraction digits than
 * the token has are refused too, unless the extra ones are all zeros: 0.1 ICP
 * is 10000000 e8s, but 0.123456789 ICP is no amount of e8s, and rounding it
 * would send something other than what was typed.
 *
 * A `DisplayReactor` takes a `nat` as its decimal text, so pass the result to
 * one as `amount.toString()`; a `Reactor` takes the `bigint` itself.
 *
 * @param text - The decimal amount, as a person types it.
 * @param decimals - The token's decimals, from 0 to 255, as `icrc1_decimals`
 * returns them.
 * @param options - `allowNegative` for an `int` amount.
 * @returns The amount in base units: `150000000n` for `"1.5"` at 8 decimals.
 * @throws TypeError when `text` is not a decimal amount (blank, letters,
 * grouping, an exponent), or `decimals` is not a whole number.
 * @throws RangeError when `text` has more significant fraction digits than
 * `decimals`, is negative without `allowNegative`, or `decimals` is outside
 * 0-255.
 *
 * @example
 * ```ts
 * import { parseTokenAmount } from "@ic-reactor/core"
 *
 * parseTokenAmount("0.29", 8) // 29000000n (Number math gives 28999999)
 * parseTokenAmount("1.1", 18) // 1100000000000000000n
 * parseTokenAmount("0.123456789", 8) // throws RangeError: 9 fraction digits
 *
 * // In a form: show the message and send nothing, or send the exact amount
 * const onSubmit = () => {
 *   let amount: bigint
 *   try {
 *     amount = parseTokenAmount(input, decimals)
 *   } catch (error) {
 *     setAmountError((error as Error).message)
 *     return
 *   }
 *   // A DisplayReactor's mutation takes the nat as text
 *   transfer.mutate([{ to: { owner }, amount: amount.toString() }])
 * }
 * ```
 */
export function parseTokenAmount(
  text: string,
  decimals: number | bigint | string,
  options: ParseTokenAmountOptions = {}
): bigint {
  if (typeof text !== "string") {
    throw new TypeError(
      `[ic-reactor] parseTokenAmount: expected the amount as text, got ${show(text)}`
    )
  }
  const scale = toDecimals(decimals, "parseTokenAmount")
  const match = DECIMAL_TEXT.exec(text.trim())
  if (!match || (!match[2] && !match[3])) {
    throw new TypeError(
      `[ic-reactor] parseTokenAmount: ${show(text)} is not a decimal amount; write digits with at most one "." (such as "1.5"), without grouping separators or an exponent`
    )
  }
  const [, minus, whole, fraction = ""] = match
  if (minus && !options.allowNegative) {
    throw new RangeError(
      `[ic-reactor] parseTokenAmount: ${show(text)} is negative; pass { allowNegative: true } to accept a negative amount`
    )
  }
  // Zeros past the token's digits change nothing, so only the rest count.
  const significant = withoutTrailingZeros(fraction)
  if (significant.length > scale) {
    throw new RangeError(
      `[ic-reactor] parseTokenAmount: ${show(text)} has ${significant.length} fraction digits, more than the token's ${scale} decimals`
    )
  }
  const units = BigInt((whole || "0") + significant.padEnd(scale, "0"))
  return minus ? -units : units
}
