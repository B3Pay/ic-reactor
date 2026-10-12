/**
 * Whether text is a principal, told without `@icp-sdk/core`: the plugin's
 * options are checked when the plugin is made, and an app whose `.did` files
 * are all on disk never loads that package.
 *
 * A principal's text is the base32 (RFC 4648, lowercase, unpadded) of the
 * principal's CRC-32, big-endian, followed by its bytes, in groups of five
 * characters joined by dashes: `ryjl3-tyaaa-aaaaa-aaaba-cai`. The text of a
 * principal is the one spelling of it, so a text is a principal's exactly
 * when the principal it decodes to is spelled as that text again, which is
 * how `Principal.fromText` decides it too. That also refuses capital letters,
 * a dash out of place, and a last character whose unused bits are not zero.
 *
 * A principal of the IC is at most 29 bytes, so 33 with its checksum, and a
 * text of more is refused here, which `Principal.fromText` does not do.
 */

/** The most bytes a principal of the IC has. */
const MAX_PRINCIPAL_BYTES = 29

/** The base32 alphabet of RFC 4648, as a principal's text writes it. */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"

/** CRC-32 (IEEE 802.3, the one of zip and PNG), the principal's checksum. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** The bytes `text` (letters of `ALPHABET` only) holds, without the bits of an unfinished byte. */
function decode(text: string): Uint8Array {
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const char of text) {
    buffer = ((buffer << 5) | ALPHABET.indexOf(char)) & 0xfff
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 0xff)
    }
  }
  return Uint8Array.from(bytes)
}

/** `bytes` in base32, the last character padded with zero bits. */
function encode(bytes: Uint8Array): string {
  let text = ""
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xfff
    bits += 8
    while (bits >= 5) {
      bits -= 5
      text += ALPHABET[(buffer >>> bits) & 0x1f]
    }
  }
  if (bits > 0) text += ALPHABET[(buffer << (5 - bits)) & 0x1f]
  return text
}

/** The text of the principal of `bytes`. */
function principalText(bytes: Uint8Array): string {
  const checksum = crc32(bytes)
  const whole = new Uint8Array(4 + bytes.length)
  whole.set(
    [
      checksum >>> 24,
      (checksum >>> 16) & 0xff,
      (checksum >>> 8) & 0xff,
      checksum & 0xff,
    ],
    0
  )
  whole.set(bytes, 4)
  return (encode(whole).match(/.{1,5}/g) ?? []).join("-")
}

/**
 * Whether `text` is the text of a principal, as a canister ID is written:
 * `ryjl3-tyaaa-aaaaa-aaaba-cai`, or `aaaaa-aa` for the management canister.
 * Never throws.
 */
export function isPrincipalText(text: string): boolean {
  if (!/^[a-z2-7-]+$/.test(text)) return false
  const decoded = decode(text.replace(/-/g, ""))
  if (decoded.length < 4 || decoded.length > 4 + MAX_PRINCIPAL_BYTES) {
    return false
  }
  return principalText(decoded.subarray(4)) === text
}
