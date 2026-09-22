import type * as z from "zod"

/**
 * Limit a float-text schema to what the display codec encodes: text that is a
 * number once trimmed and stays finite as the float type, after narrowing for
 * `float32`.
 *
 * The schemas checked only `!isNaN(Number(value))`. `Number(" ")` is 0, so a
 * blank value passed, and so did "Infinity" and "1e400"; 3.5e38 is a finite
 * double that IDL.encode narrows to float32 Infinity. The display codec
 * rejects all of them at call time, after the form said the value was valid.
 * Deliberately not re-exported from the package.
 */
export function withFloatBounds(
  schema: z.ZodString,
  bits: number,
  message: string
): z.ZodString {
  const isNumber = (value: string) =>
    value.trim() !== "" && !Number.isNaN(Number(value))

  return schema.refine(isNumber, { message }).refine(
    (value) => {
      // Text that is not a number is reported by the check above.
      if (!isNumber(value)) return true
      const number = Number(value)
      return Number.isFinite(bits === 32 ? Math.fround(number) : number)
    },
    { message: `Must be a finite float${bits}` }
  )
}
