const HEX_DIGITS = /^[0-9a-f]*$/i

/** Lower-case hex of `bytes`, two digits per byte, no prefix. */
export function toHex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

/**
 * The bytes of hex text, or `undefined` when it is not hex: an odd number of
 * digits, or anything but digits after an optional `0x`. Upper and lower case
 * are both read. Surrounding whitespace is ignored; separators inside are not
 * (this reads argument bytes from URLs, where a typo must not pass).
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

/** SHA-256 of `bytes` as lower-case hex, with Web Crypto (browser and Node). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A copy, so the digest gets an ArrayBuffer-backed view even when `bytes`
  // is a view over a SharedArrayBuffer or a larger buffer.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return toHex(new Uint8Array(digest))
}
