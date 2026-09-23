import * as z from "zod"

/**
 * What a blob field takes, as the display codec reads it at call time: hex
 * text (an optional `0x` prefix, then two hex digits per byte), a byte array
 * of integers from 0 to 255, or a Uint8Array.
 *
 * The schema accepted any text and any numbers, so "hello", "ab cd" and
 * [256] passed the form and failed the call. An odd number of hex digits is
 * refused too: the codec no longer pads it with a leading zero, which sent a
 * subaccount missing one digit as a different subaccount. Deliberately not
 * re-exported from the package.
 */
export function blobSchema(): z.ZodTypeAny {
  return z.union([
    z
      .string()
      .regex(/^(0x)?([0-9a-f]{2})*$/i, "Must be hex, two digits per byte"),
    z.array(z.number().int().min(0).max(255)),
    z.instanceof(Uint8Array),
  ])
}
