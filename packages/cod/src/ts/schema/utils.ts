import type { PrincipalLike } from "../index.js"
import type { BlobLike } from "./types.js"

/**
 * Converts a principal-like value to principal text.
 *
 * @param value - Principal text or object with a `toText` method.
 * @returns Principal text.
 */
export function principalToText(value: PrincipalLike): string {
  return typeof value === "string" ? value : value.toText()
}

/**
 * Converts a blob-like value to a `Uint8Array`.
 *
 * @param value - Existing byte array or number array.
 * @returns Byte array view or copy.
 */
export function blobToBytes(value: BlobLike): Uint8Array {
  if (value instanceof Uint8Array) {
    return value
  }
  return new Uint8Array(value)
}

/**
 * Decodes hexadecimal blob text into bytes.
 *
 * @param value - Hexadecimal text, with or without a `0x` prefix.
 * @returns Decoded bytes.
 * @throws If the string is not even-length hexadecimal text.
 */
export function hexToBytes(value: string): Uint8Array {
  const hex =
    value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("hex blob codec expects an even-length hexadecimal string")
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Encodes bytes as lowercase hexadecimal text.
 *
 * @param bytes - Bytes to encode.
 * @returns Lowercase hexadecimal string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

/**
 * Decodes base64 text into bytes.
 *
 * @param value - Base64 text.
 * @returns Decoded bytes.
 */
export function base64ToBytes(value: string): Uint8Array {
  const maybeBuffer = (
    globalThis as typeof globalThis & {
      Buffer?: { from(input: string, encoding: "base64"): Uint8Array }
    }
  ).Buffer
  if (maybeBuffer) {
    return new Uint8Array(maybeBuffer.from(value, "base64"))
  }

  const binary = globalThis.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encodes bytes as base64 text.
 *
 * @param bytes - Bytes to encode.
 * @returns Base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from(input: Uint8Array): { toString(encoding: "base64"): string }
      }
    }
  ).Buffer
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString("base64")
  }

  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return globalThis.btoa(binary)
}

/**
 * Encodes bytes as Candid blob byte escapes.
 *
 * @param bytes - Bytes to encode.
 * @returns Candid blob literal content such as `\00\ff`.
 */
export function bytesToCandidBlob(bytes: Uint8Array): string {
  return Array.from(
    bytes,
    (byte) => `\\${byte.toString(16).padStart(2, "0")}`
  ).join("")
}

/**
 * Asserts that a number is a valid byte.
 *
 * @param value - Number to validate.
 * @throws If the value is not an integer from 0 through 255.
 */
export function assertByte(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`blob byte out of range: ${value}`)
  }
}

/**
 * Renders a Candid label using identifier syntax when possible.
 *
 * @param value - Label text.
 * @returns Identifier text or quoted string label.
 */
export function candidLabel(value: string): string {
  return isIdentifier(value) && !CANDID_KEYWORDS.has(value)
    ? value
    : JSON.stringify(value)
}

const CANDID_KEYWORDS = new Set([
  "blob",
  "bool",
  "decimal",
  "empty",
  "float32",
  "float64",
  "func",
  "import",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "nat",
  "nat8",
  "nat16",
  "nat32",
  "nat64",
  "null",
  "opt",
  "principal",
  "query",
  "record",
  "reserved",
  "service",
  "text",
  "type",
  "variant",
  "vec",
])

/**
 * Checks whether a string is valid identifier text for this schema runtime.
 *
 * @param value - String to inspect.
 * @returns `true` when the string can be emitted as an unquoted label.
 */
export function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

/**
 * Checks whether a character can appear in an identifier.
 *
 * @param value - Character to inspect.
 * @returns `true` when the character is identifier-compatible.
 */
export function isIdentifierChar(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/.test(value)
}

/**
 * Checks whether a character is whitespace.
 *
 * @param value - Character to inspect.
 * @returns `true` when the character is whitespace.
 */
export function isWhitespace(value: string | undefined): boolean {
  return value !== undefined && /\s/.test(value)
}

/**
 * Checks whether a character is a hexadecimal digit.
 *
 * @param value - Character to inspect.
 * @returns `true` when the character is hexadecimal.
 */
export function isHexDigit(value: string | undefined): boolean {
  return value !== undefined && /[0-9a-fA-F]/.test(value)
}

/**
 * Asserts that a tuple-like value has the expected length.
 *
 * @param value - Tuple candidate.
 * @param expected - Expected tuple length.
 * @param label - Human-readable label used in the error message.
 * @throws If `value` is not an array with exactly `expected` entries.
 */
export function assertTupleLength(
  value: readonly unknown[],
  expected: number,
  label: string
): void {
  if (!Array.isArray(value) || value.length !== expected) {
    throw new Error(
      `${label} expected ${expected} value(s), got ${Array.isArray(value) ? value.length : "non-array"}`
    )
  }
}
