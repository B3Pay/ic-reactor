// Principals as branded text at the boundary.
//
// @candid-core/schema decodes a principal to a structural carrier
// `{ toText(): string }` (its `PrincipalValue`), and encodes anything with a
// `toText()`. Handles use the one representation an app can put in a query
// key, compare with `===`, render and serialise: text. Every value crossing
// the boundary is walked, schema-directed, to swap carriers for branded text
// on the way out and branded text for carriers on the way in.
import type { AnyFieldSchema, PrincipalValue } from "@candid-core/schema"
import { resolveSchema } from "@candid-core/schema"
import { principalBytesFromText } from "@candid-core/schema/codec"

declare const principalBrand: unique symbol

/** Principal text that has been checked to be canonical. */
export type PrincipalText = string & { readonly [principalBrand]: true }

/** Checks and brands principal text. Throws `TypeError` when it is not one. */
export function principal(text: string): PrincipalText {
  if (!isPrincipalText(text)) {
    throw new TypeError(`not a principal: ${JSON.stringify(text)}`)
  }
  return text
}

/** Whether `text` is canonical principal text. Never throws. */
export function isPrincipalText(text: unknown): text is PrincipalText {
  if (typeof text !== "string") return false
  try {
    return principalBytesFromText(text) !== undefined
  } catch {
    return false
  }
}

/** The generated type with every `PrincipalValue` replaced by `PrincipalText`. */
export type Textify<T> = T extends PrincipalValue
  ? PrincipalText
  : T extends Uint8Array
    ? T
    : T extends bigint | number | string | boolean | null | undefined
      ? T
      : T extends readonly unknown[]
        ? { -readonly [K in keyof T]: Textify<T[K]> }
        : T extends object
          ? { [K in keyof T]: Textify<T[K]> }
          : T

type Direction = "in" | "out"

const principalFree = new WeakMap<object, boolean>()

/**
 * Whether a schema can hold a principal anywhere, so values of the many that
 * cannot skip the walk. Cycles (via `rec`) count as principal-free until a
 * principal is found.
 */
function mentionsPrincipal(
  schema: AnyFieldSchema,
  visiting = new Set<object>()
): boolean {
  const cached = principalFree.get(schema)
  if (cached !== undefined) return !cached
  if (visiting.has(schema)) return false
  visiting.add(schema)
  const node = resolveSchema(schema)
  let found: boolean
  switch (node.kind) {
    case "primitive":
      found = node.primitive === "principal"
      break
    case "opt":
    case "vec":
      found = mentionsPrincipal(node.inner, visiting)
      break
    case "record":
      found = Object.values(node.fields).some((f) =>
        mentionsPrincipal(f as AnyFieldSchema, visiting)
      )
      break
    case "variant":
      found = Object.values(node.arms).some((f) =>
        mentionsPrincipal(f as AnyFieldSchema, visiting)
      )
      break
    case "tuple":
      found = (node.elements as readonly AnyFieldSchema[]).some((e) =>
        mentionsPrincipal(e, visiting)
      )
      break
    case "func":
    case "service":
      found = true
      break
    default:
      found = false
  }
  visiting.delete(schema)
  if (visiting.size === 0) principalFree.set(schema, !found)
  return found
}

const carrier = (text: string): PrincipalValue => ({ toText: () => text })

function convertPrincipal(value: unknown, direction: Direction): unknown {
  if (direction === "out") {
    return value !== null && typeof value === "object" && "toText" in value
      ? (value as PrincipalValue).toText()
      : value
  }
  // In: branded text (or any text) becomes a carrier; the codec checks it.
  return typeof value === "string" ? carrier(value) : value
}

function walk(
  schema: AnyFieldSchema,
  value: unknown,
  direction: Direction
): unknown {
  if (!mentionsPrincipal(schema)) return value
  const node = resolveSchema(schema)
  switch (node.kind) {
    case "primitive":
      return node.primitive === "principal"
        ? convertPrincipal(value, direction)
        : value
    case "opt":
      return value === null ? null : walk(node.inner, value, direction)
    case "vec":
      return Array.isArray(value)
        ? value.map((v) => walk(node.inner, v, direction))
        : value
    case "tuple": {
      const elements = node.elements as readonly AnyFieldSchema[]
      return Array.isArray(value)
        ? value.map((v, i) =>
            elements[i] ? walk(elements[i], v, direction) : v
          )
        : value
    }
    case "record": {
      if (value === null || typeof value !== "object") return value
      const out: Record<string, unknown> = {}
      for (const [key, v] of Object.entries(value)) {
        const field = (node.fields as Record<string, AnyFieldSchema>)[key]
        out[key] = field ? walk(field, v, direction) : v
      }
      return out
    }
    case "variant": {
      if (value === null || typeof value !== "object" || !("tag" in value))
        return value
      const tagged = value as { tag: string; value?: unknown }
      const arm = (node.arms as Record<string, AnyFieldSchema>)[tagged.tag]
      if (!arm || !("value" in tagged)) return value
      return { ...tagged, value: walk(arm, tagged.value, direction) }
    }
    case "func": {
      if (value === null || typeof value !== "object") return value
      const ref = value as { principal: unknown; method: unknown }
      return { ...ref, principal: convertPrincipal(ref.principal, direction) }
    }
    case "service":
      return convertPrincipal(value, direction)
    default:
      return value
  }
}

/** App values (principals as text) → values the codec encodes. */
export const toWire = (schema: AnyFieldSchema, value: unknown) =>
  walk(schema, value, "in")
/** Decoded values (principal carriers) → app values (principals as text). */
export const fromWire = (schema: AnyFieldSchema, value: unknown) =>
  walk(schema, value, "out")
