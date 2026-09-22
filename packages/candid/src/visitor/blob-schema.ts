import * as z from "zod"

/**
 * What a blob field takes, as the display codec reads it at call time: hex
 * text (an optional `0x` prefix, then hex digits, an odd count padded with a
 * leading zero), a byte array of integers from 0 to 255, or a Uint8Array.
 *
 * The schema accepted any text and any numbers, so "hello", "ab cd" and
 * [256] passed the form and failed the call. Deliberately not re-exported
 * from the package.
 */
export function blobSchema(): z.ZodTypeAny {
  return z.union([
    z.string().regex(/^(0x)?[0-9a-f]*$/i, "Must be hex"),
    z.array(z.number().int().min(0).max(255)),
    z.instanceof(Uint8Array),
  ])
}
