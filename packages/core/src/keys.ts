/**
 * Query keys (DECISIONS Q5):
 *
 *     ['ic-reactor', network, caller, canisterId, method, args, ('certified')]
 *
 * - `caller` is the principal the read is made as, so a key never holds
 *   another principal's data, and a sign-in, a sign-out or a switch of account
 *   moves every read to a new key.
 * - `canisterId` is `"$unresolved:<name>"` for a `{ name }` target the
 *   `ic_env` cookie does not resolve.
 * - `args` is the hex of the Candid encoding of the arguments. The bytes depend
 *   only on the values and the Candid types, never on how the schema was built
 *   (a generated module and `schemaFromContract` agree), and never on the order
 *   of a record's keys. Two tags take its place: `"$skip"` for `skipToken`, and
 *   `"$invalid", <text>` for arguments that do not encode, so building the key
 *   never throws. Hex never starts with `$`.
 * - `"certified"` ends every full key of a certified canister, so an
 *   uncertified answer is never served where a certified one was asked for. A
 *   prefix without it matches both.
 *
 * Internal: not exported from the package entry.
 *
 * @module
 */

/** The first segment of every key ic-reactor builds. */
export const KEY_ROOT = "ic-reactor"

/** The trailing segment of a certified read's key. */
export const CERTIFIED = "certified"

/** The args segment of a skipped read. */
export const SKIP = "$skip"

/** The tag before the text of arguments that do not encode. */
export const INVALID = "$invalid"

/** The canisterId segment of a `{ name }` target that did not resolve. */
export const unresolvedSlot = (name: string): string => `$unresolved:${name}`

/** Lower-case hex of `bytes`. */
export const toHex = (bytes: Uint8Array): string => {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

/** How deep {@link stableText} walks before it writes `…`. */
const TEXT_DEPTH = 32

/**
 * A deterministic text for any value, for the key of arguments that do not
 * encode: the same value gives the same text, different values almost always
 * different text, and nothing throws. Object keys are sorted, `bigint` ends in
 * `n`, bytes are written as hex, and cycles, getters that throw and very deep
 * values are written as markers rather than followed.
 */
export function stableText(value: unknown): string {
  const seen = new Set<object>()
  const write = (item: unknown, depth: number): string => {
    switch (typeof item) {
      case "string":
        return JSON.stringify(item)
      case "bigint":
        return `${item}n`
      case "number":
        return Object.is(item, -0) ? "-0" : String(item)
      case "boolean":
        return String(item)
      case "undefined":
        return "undefined"
      case "symbol":
        return item.toString()
      case "function":
        return "function"
    }
    if (item === null) return "null"
    const object = item as object
    if (depth >= TEXT_DEPTH) return "…"
    if (seen.has(object)) return "[circular]"
    if (Object.prototype.toString.call(object) === "[object Uint8Array]") {
      return `0x${toHex(object as Uint8Array)}`
    }
    seen.add(object)
    try {
      if (Array.isArray(object)) {
        return `[${object.map((entry) => write(entry, depth + 1)).join(",")}]`
      }
      const keys = Object.keys(object).sort()
      return `{${keys
        .map((key) => {
          let entry: unknown
          try {
            entry = (object as Record<string, unknown>)[key]
          } catch {
            return `${JSON.stringify(key)}:[unreadable]`
          }
          return `${JSON.stringify(key)}:${write(entry, depth + 1)}`
        })
        .join(",")}}`
    } catch {
      return "[unreadable]"
    } finally {
      seen.delete(object)
    }
  }
  return write(value, 0)
}
