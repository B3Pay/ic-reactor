import { toHex } from "../lib/hex.ts"
import { isBytes } from "./schema.ts"

/**
 * A value as display JSON, indented by two spaces: bigints as decimal
 * strings, blobs (`Uint8Array`) as lower-case hex strings, NaN and the
 * infinities as strings, and `undefined` (a method with no reply) as `null`.
 * Lossy on purpose: it is for reading and copying, not for round trips (the
 * Candid text and the hex bytes are exact).
 */
export function toDisplayJson(value: unknown): string {
  try {
    return JSON.stringify(value, displayReplacer, 2) ?? "null"
  } catch {
    // A cycle, or a toJSON that throws: domain values have neither.
    return JSON.stringify("[a value that cannot be shown as JSON]")
  }
}

// A function, not an arrow: `this` is the holder, whose property is the value
// before any toJSON ran (a Node Buffer would otherwise arrive as an object).
function displayReplacer(this: unknown, key: string, value: unknown): unknown {
  const raw: unknown =
    typeof this === "object" && this !== null
      ? (this as Record<string, unknown>)[key]
      : value
  if (typeof raw === "bigint") return raw.toString()
  if (isBytes(raw)) return toHex(raw)
  if (typeof raw === "number" && !Number.isFinite(raw)) return String(raw)
  return value
}
