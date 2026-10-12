// Arguments as loose JSON, for export and import. Export writes what
// `draftFromValue` reads back: bigints as decimal strings, blobs as hex,
// principals as text, variants as { tag, value }, opts as null or the value
// ({ some } when boxed), and the floats JSON has no number for (NaN,
// ±Infinity, -0) as strings. It is lossless for the form, not a Candid
// encoding.
import type { AnyFieldSchema } from "@candid-core/schema"
import { toHex } from "../lib/hex.ts"
import { draftFromValue, isBytes, type DraftNote } from "./engine.ts"

/** The argument values as pretty JSON: always an array, one entry per argument. */
export function argsToJson(values: readonly unknown[]): string {
  return JSON.stringify(values, jsonValue, 2)
}

function jsonValue(_key: string, v: unknown): unknown {
  if (typeof v === "bigint") return v.toString()
  if (isBytes(v)) return toHex(v)
  if (typeof v === "number") {
    // JSON.stringify writes NaN and ±Infinity as null and -0 as 0, which
    // read back as "required" and as other bytes; the float field reads
    // these strings.
    if (Number.isNaN(v)) return "NaN"
    if (v === Infinity) return "Infinity"
    if (v === -Infinity) return "-Infinity"
    if (Object.is(v, -0)) return "-0"
  }
  return v
}

export type ParsedArgs =
  | { readonly ok: true; readonly values: unknown[] }
  | { readonly ok: false; readonly message: string }

/**
 * Argument values from JSON text: an array with one entry per argument. A
 * one-argument method also takes the bare value. Integer literals past 2^53
 * are read as strings, so their digits survive `JSON.parse`.
 */
export function parseArgsJson(
  text: string,
  args: readonly AnyFieldSchema[]
): ParsedArgs {
  const argCount = args.length
  let parsed: unknown
  try {
    parsed = JSON.parse(quoteUnsafeIntegers(text))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Not valid JSON: ${message}` }
  }
  const [only] = args
  if (Array.isArray(parsed) && parsed.length === argCount) {
    // `["abc"]` for a lone `vec text` is that list, not the argument "abc":
    // the bare reading wins when only it fits the argument's type.
    if (
      only !== undefined &&
      argCount === 1 &&
      notesFor(only, parsed[0]).length > 0 &&
      notesFor(only, parsed).length === 0
    )
      return { ok: true, values: [parsed] }
    return { ok: true, values: parsed }
  }
  // Anything else is the bare value of a one-argument method, `[1, 2]` for a
  // `vec nat` included; the export always writes the list form, `[[1, 2]]`.
  if (argCount === 1) return { ok: true, values: [parsed] }
  const expected = `${argCount} argument values`
  return {
    ok: false,
    message: Array.isArray(parsed)
      ? `Expected ${expected}, got ${parsed.length}.`
      : `Expected an array of ${expected}.`,
  }
}

/** What `draftFromValue` could not use as given, reading `value` for `schema`. */
function notesFor(schema: AnyFieldSchema, value: unknown): DraftNote[] {
  const notes: DraftNote[] = []
  draftFromValue(schema, value, { notes })
  return notes
}

/**
 * JSON text with every integer literal that is not a safe integer wrapped in
 * quotes, outside strings. `12345678901234567890` would otherwise parse to
 * 12345678901234567000.
 */
export function quoteUnsafeIntegers(text: string): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const ch = text[i] as string
    if (ch === '"') {
      // Copy the string literal as it is, escapes included.
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const number = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y
      number.lastIndex = i
      const match = number.exec(text)
      if (match !== null) {
        const token = match[0]
        const integer = match[1] === undefined && match[2] === undefined
        out +=
          integer && !Number.isSafeInteger(Number(token)) ? `"${token}"` : token
        i += token.length
        continue
      }
    }
    out += ch
    i++
  }
  return out
}
