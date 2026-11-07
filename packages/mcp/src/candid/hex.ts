const HEX_DIGITS = /^[0-9a-f]*$/i

const BYTE_HEX = Array.from({ length: 256 }, (_, b) =>
  b.toString(16).padStart(2, "0")
)

/** Lower-case hex of `bytes`, two digits per byte, no prefix; "" for none. */
export function toHex(bytes: Uint8Array): string {
  const out: string[] = []
  for (const byte of bytes) out.push(BYTE_HEX[byte] as string)
  return out.join("")
}

/**
 * The bytes of hex text, or `undefined` when it is not hex: an odd number of
 * digits, or anything but digits after an optional `0x`. Upper and lower case
 * are both read and surrounding whitespace is ignored; separators inside are
 * not, so a typo cannot pass as other bytes.
 */
export function fromHex(text: string): Uint8Array | undefined {
  const trimmed = text.trim()
  const digits = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed
  if (digits.length % 2 !== 0 || !HEX_DIGITS.test(digits)) return undefined
  const bytes = new Uint8Array(digits.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
