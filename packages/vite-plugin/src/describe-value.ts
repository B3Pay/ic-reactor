/**
 * Quoting a value a config gave in a message. A JavaScript config is not
 * type-checked, so an option can hold a value of any kind: a bigint, a
 * symbol, a function, an object that holds itself, or one whose getter
 * throws. `JSON.stringify` throws on a bigint and on an object that holds
 * itself, and `String` on an object whose `toString` throws, so a message
 * built with either could throw instead of failing the canister it is about.
 */

import { types } from "node:util"

/** How deep `describeValue` looks into lists and objects. */
const MAX_DEPTH = 3

/** How many items of one list or object `describeValue` shows. */
const MAX_ITEMS = 10

/**
 * `value` as a message quotes it: as JSON where JSON says what it is (`null`,
 * `false`, `0`, `""`, `["a"]`, `{"host":"x"}`), and as JavaScript writes it
 * where JSON cannot, or would say something else (`1n`, `undefined`, `NaN`,
 * `Symbol(live)`). A function is `a function`, an object met again inside
 * itself `[circular]`, an accessor `[getter]`, and a proxy `a proxy`: no code
 * of the value's runs, neither a getter nor a `toString` nor a proxy's trap.
 * Never throws.
 */
export function describeValue(value: unknown): string {
  return describe(value, [], 0)
}

/**
 * Node's own getter of a `DOMException`'s `message`, which the class keeps
 * behind it rather than on the error: an `AbortError`'s, a `TimeoutError`'s.
 * It reads the message of a `DOMException` and throws for anything else.
 */
const domExceptionMessage = ((): ((this: unknown) => unknown) | undefined => {
  try {
    const { get } =
      Object.getOwnPropertyDescriptor(
        globalThis.DOMException?.prototype ?? {},
        "message"
      ) ?? {}
    return typeof get === "function" ? get : undefined
  } catch {
    return undefined
  }
})()

/**
 * What was thrown, in words fit for a message: an `Error`'s message, or the
 * value itself as `describeValue` quotes it. Never throws, and runs no code
 * of the value's: the message is an `Error`'s own, or a `DOMException`'s,
 * read by Node's own getter. One that a class of the error's own makes a
 * getter is not read, and the error is quoted as `describeValue` quotes it.
 */
export function describeError(error: unknown): string {
  try {
    if (!types.isProxy(error) && error instanceof Error) {
      const message = Object.getOwnPropertyDescriptor(error, "message")
      if (message && "value" in message && typeof message.value === "string") {
        return message.value
      }
      // Throws for an error that is not a DOMException.
      const text = domExceptionMessage?.call(error)
      if (typeof text === "string") return text
    }
  } catch {
    // Quoted below.
  }
  return describeValue(error)
}

function describe(value: unknown, within: object[], depth: number): string {
  try {
    switch (typeof value) {
      case "string":
        return JSON.stringify(value)
      case "number":
        return Object.is(value, -0) ? "-0" : String(value)
      case "bigint":
        return `${value}n`
      case "symbol":
        // `String` names a symbol, where a template literal throws.
        return String(value)
      case "function":
        return types.isProxy(value) ? "a proxy" : "a function"
      case "boolean":
      case "undefined":
        return String(value)
    }
    if (value === null) return "null"
    const object = value as object
    // Every look inside a proxy runs one of its traps.
    if (types.isProxy(object)) return "a proxy"
    if (within.includes(object)) return "[circular]"
    const isList = Array.isArray(object)
    if (depth >= MAX_DEPTH) return isList ? "[…]" : "{…}"
    const inside = [...within, object]
    const total = isList ? (object as unknown[]).length : undefined
    const keys = isList
      ? Array.from({ length: Math.min(total ?? 0, MAX_ITEMS) }, (_, index) =>
          String(index)
        )
      : Object.keys(object)
    const items = keys.slice(0, MAX_ITEMS).map((key) => {
      const item = describeOwn(object, key, inside, depth + 1)
      return isList ? item : `${JSON.stringify(key)}:${item}`
    })
    const more = (total ?? keys.length) - items.length
    if (more > 0) items.push(`… ${more} more`)
    if (isList) return `[${items.join(",")}]`
    const kind = kindOf(object)
    return `${kind ? `${kind} ` : ""}{${items.join(",")}}`
  } catch {
    return "[unreadable]"
  }
}

/** The own property `key` of `object`, without running a getter. */
function describeOwn(
  object: object,
  key: string,
  within: object[],
  depth: number
): string {
  try {
    const property = Object.getOwnPropertyDescriptor(object, key)
    if (!property) return "undefined"
    if (!("value" in property)) return "[getter]"
    return describe(property.value, within, depth)
  } catch {
    return "[unreadable]"
  }
}

/**
 * The name of the class `object` is an instance of when it is not a plain
 * object (`Map`, `URL`, `Date`), or `""`. Read from data properties only.
 */
function kindOf(object: object): string {
  const prototype = Object.getPrototypeOf(object) as object | null
  if (
    prototype === null ||
    prototype === Object.prototype ||
    types.isProxy(prototype)
  ) {
    return ""
  }
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")
  const type: unknown =
    constructor && "value" in constructor ? constructor.value : undefined
  if (typeof type !== "function" || types.isProxy(type)) return ""
  const name = Object.getOwnPropertyDescriptor(type, "name")
  return name && "value" in name && typeof name.value === "string"
    ? name.value
    : ""
}
