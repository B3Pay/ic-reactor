import type * as z from "zod"

const INTEGER = /^-?\d+$/

/**
 * Limit an integer-string schema to the range of a fixed-width Candid integer.
 *
 * The form schemas checked only that a value was made of digits, so a `nat8`
 * field accepted "300" and the display codec rejected it later, when the call
 * was made. Text that is not an integer is left to the schema's own pattern
 * check, which reports it. Deliberately not re-exported from the package.
 */
export function withIntegerBounds(
  schema: z.ZodString,
  bits: number,
  signed: boolean
): z.ZodString {
  const min = signed ? -(BigInt(2) ** BigInt(bits - 1)) : BigInt(0)
  const max = signed
    ? BigInt(2) ** BigInt(bits - 1) - BigInt(1)
    : BigInt(2) ** BigInt(bits) - BigInt(1)

  return schema.refine(
    (value) => {
      if (!INTEGER.test(value)) return true
      const n = BigInt(value)
      return n >= min && n <= max
    },
    { message: `Must be between ${min} and ${max}` }
  )
}
