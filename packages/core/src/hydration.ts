/**
 * The lossless serializer a client's `QueryClient` dehydrates and hydrates
 * with, so a server render can hand its cache to the browser as JSON.
 *
 * Candid values are not JSON values. `nat`, `int` and every 64-bit integer
 * decode to `bigint`, which `JSON.stringify` refuses; `blob` decodes to a
 * `Uint8Array`, which it turns into an object of numbered keys; a float can be
 * `NaN`, `±Infinity` or `-0`, which it turns into `null` or `0`. So
 * {@link serializeData} rewrites those into tagged JSON objects and
 * {@link deserializeData} rewrites them back, and everything JSON already
 * keeps (strings such as principal text, `null`, booleans, arrays, records,
 * variants as `{ tag, value }`) passes through unchanged.
 *
 * A tag is an object with the key `"$ic"`. A real object that has that key is
 * escaped (wrapped in an `"object"` tag), so a canister record that happens to
 * look like a tag comes back as the record it was.
 *
 * Internal: the client sets these as its `QueryClient`'s
 * `defaultOptions.dehydrate.serializeData` and
 * `defaultOptions.hydrate.deserializeData`; nothing else uses them and the
 * package entry does not export them.
 *
 * @module
 */

/** A value `JSON.stringify` writes and `JSON.parse` reads back unchanged. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** The key that marks a tagged value. */
const TAG = "$ic"

/**
 * What a tag stands for. `v` holds the payload:
 *
 * - `bigint`: decimal text, such as `"-18446744073709551616"`.
 * - `bytes`: a `Uint8Array`, as base64.
 * - `number`: `"NaN"`, `"Infinity"`, `"-Infinity"` or `"-0"`, the four numbers
 *   JSON cannot write.
 * - `undefined`: no payload. JSON drops a key whose value is `undefined` and
 *   writes `null` in its place in an array; a tag keeps either as it was.
 * - `object`: an object that has the key `"$ic"` itself, with its entries
 *   encoded in `v`.
 */
type Tag = "bigint" | "bytes" | "number" | "undefined" | "object"

const tagged = (tag: Tag, payload?: JsonValue): JsonValue =>
  payload === undefined ? { [TAG]: tag } : { [TAG]: tag, v: payload }

/**
 * Sets `key` on `target` as an own, enumerable data property. A plain
 * assignment of `"__proto__"` would replace the object's prototype instead of
 * adding the key a Candid record (or `JSON.parse`) can give it.
 */
const setOwn = (target: object, key: string, value: unknown): void => {
  if (key === "__proto__") {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  } else {
    ;(target as Record<string, unknown>)[key] = value
  }
}

/**
 * Whether `value` is a `Uint8Array`, from this realm or another (a vm context,
 * a test DOM), where `instanceof` would say no. Node's `Buffer` counts.
 */
const isBytes = (value: object): value is Uint8Array =>
  Object.prototype.toString.call(value) === "[object Uint8Array]"

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

/** Base64 of `bytes`, in chunks so a large blob does not overflow the argument list. */
function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(start, start + 0x8000))
    )
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A number JSON cannot write, as its tag payload, or `undefined` for one it can. */
const specialNumber = (value: number): string | undefined => {
  if (Number.isNaN(value)) return "NaN"
  if (value === Infinity) return "Infinity"
  if (value === -Infinity) return "-Infinity"
  if (Object.is(value, -0)) return "-0"
  return undefined
}

const SPECIAL_NUMBERS: Readonly<Record<string, number>> = {
  NaN: NaN,
  Infinity: Infinity,
  "-Infinity": -Infinity,
  "-0": -0,
}

/** Whether JSON leaves `value` out of an object (and writes `null` for it in an array). */
const isSkipped = (value: unknown): boolean =>
  typeof value === "function" || typeof value === "symbol"

/**
 * Rewrites `data` into a value JSON keeps exactly. See the module comment for
 * what is tagged.
 *
 * Anything that is not a Candid value is treated as `JSON.stringify` treats
 * it, so data an app caches from elsewhere comes out no worse than it would
 * without this serializer: an object with a `toJSON()` (a `Date`) is replaced
 * by what that returns, another object is reduced to its own enumerable keys,
 * and a function or symbol is dropped from an object and becomes `null` in an
 * array.
 *
 * @throws TypeError on a cyclic structure, as `JSON.stringify` does.
 */
export function serializeData(data: unknown): JsonValue {
  const ancestors = new Set<object>()

  const encode = (value: unknown): JsonValue => {
    switch (typeof value) {
      case "string":
      case "boolean":
        return value
      case "number": {
        const special = specialNumber(value)
        return special === undefined ? value : tagged("number", special)
      }
      case "bigint":
        return tagged("bigint", value.toString())
      case "undefined":
        return tagged("undefined")
      case "function":
      case "symbol":
        return null
    }
    if (value === null) return null
    const object = value as object
    if (isBytes(object)) return tagged("bytes", toBase64(object))
    if (ancestors.has(object)) {
      throw new TypeError(
        "[ic-reactor] cannot dehydrate a query whose data is a cyclic structure"
      )
    }
    ancestors.add(object)
    try {
      if (Array.isArray(object)) {
        // An index loop, not `map`, so a hole comes back as `undefined`
        // rather than as JSON's `null`.
        const items: JsonValue[] = []
        for (let i = 0; i < object.length; i += 1) {
          const item: unknown = object[i]
          items.push(isSkipped(item) ? null : encode(item))
        }
        return items
      }
      const toJSON = (object as { toJSON?: unknown }).toJSON
      if (typeof toJSON === "function") {
        return encode((toJSON as () => unknown).call(object))
      }
      const entries: { [key: string]: JsonValue } = {}
      for (const key of Object.keys(object)) {
        const item: unknown = (object as Record<string, unknown>)[key]
        if (!isSkipped(item)) setOwn(entries, key, encode(item))
      }
      return hasOwn(object, TAG) ? tagged("object", entries) : entries
    } finally {
      ancestors.delete(object)
    }
  }

  return encode(data)
}

const badTag = (detail: string): TypeError =>
  new TypeError(
    `[ic-reactor] cannot hydrate a query: ${detail}. Was it dehydrated by a client of another ic-reactor version?`
  )

/**
 * Rewrites what {@link serializeData} produced, after a JSON round trip, back
 * into the value it was made from.
 *
 * @throws TypeError on a tag it does not know, which means the data was not
 * dehydrated by this serializer.
 */
export function deserializeData(data: unknown): unknown {
  const decodeEntries = (object: object): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(object)) {
      setOwn(out, key, decode((object as Record<string, unknown>)[key]))
    }
    return out
  }

  const decode = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null) return value
    if (Array.isArray(value)) return value.map(decode)
    if (!hasOwn(value, TAG)) return decodeEntries(value)
    const { [TAG]: tag, v: payload } = value as Record<string, unknown>
    switch (tag) {
      case "bigint":
        if (typeof payload === "string") return BigInt(payload)
        break
      case "bytes":
        if (typeof payload === "string") return fromBase64(payload)
        break
      case "number":
        if (typeof payload === "string" && hasOwn(SPECIAL_NUMBERS, payload)) {
          return SPECIAL_NUMBERS[payload]
        }
        break
      case "undefined":
        return undefined
      case "object":
        if (typeof payload === "object" && payload !== null) {
          return decodeEntries(payload)
        }
        break
      default:
        throw badTag(`unknown tag ${JSON.stringify(tag)}`)
    }
    throw badTag(`a malformed ${String(tag)} tag`)
  }

  return decode(data)
}
