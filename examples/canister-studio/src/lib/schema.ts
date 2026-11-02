// Schema reading helpers shared by the forms and the value viewers, over
// @meantjs/schema's public API only.
import {
  resolveSchema,
  type AnyFieldSchema,
  type ResolvedNode,
} from "@meantjs/schema"

export type RecordNode = Extract<ResolvedNode, { kind: "record" }>
export type TupleNode = Extract<ResolvedNode, { kind: "tuple" }>
export type VariantNode = Extract<ResolvedNode, { kind: "variant" }>

// Generated modules build a fresh node on every `rec` body() call: memoizing
// gives one node per declaration and a stable identity, which the forms'
// cycle cut of defaults needs. Loaded schemas are already one node per type.
const resolved = new WeakMap<object, ResolvedNode>()

/** The schema with every `rec` followed: what `.kind` can be read on. */
export function resolve(schema: AnyFieldSchema): ResolvedNode {
  let node = resolved.get(schema)
  if (node === undefined) {
    node = resolveSchema(schema)
    resolved.set(schema, node)
  }
  return node
}

// The erased node types carry `any` children (RecordSchema<any>.fields is
// `any`): these accessors name their real shape once.

/** A record's fields in schema order (Candid label-id order). */
export function fieldsOf(
  node: RecordNode
): readonly (readonly [string, AnyFieldSchema])[] {
  return Object.entries(node.fields as Record<string, AnyFieldSchema>)
}

/** A tuple's element schemas. */
export function elementsOf(node: TupleNode): readonly AnyFieldSchema[] {
  return node.elements as readonly AnyFieldSchema[]
}

/** A variant's arms in schema order. */
export function armsOf(
  node: VariantNode
): readonly (readonly [string, AnyFieldSchema])[] {
  return Object.entries(node.arms as Record<string, AnyFieldSchema>)
}

/** The arm schema of `tag`, read as an own property ("toString" is a valid tag). */
export function armOf(
  node: VariantNode,
  tag: string
): AnyFieldSchema | undefined {
  return getOwn(node.arms as Record<string, AnyFieldSchema>, tag)
}

/** Whether a variant arm carries no payload (its type is `null`). */
export function isTagOnly(arm: AnyFieldSchema): boolean {
  const node = resolve(arm)
  return node.kind === "primitive" && node.primitive === "null"
}

/**
 * Fields for people: required (non-opt) fields first, then the optional
 * ones, each group in schema order. Candid orders fields by label id, which
 * reads as random.
 */
export function orderFields<F extends readonly [string, AnyFieldSchema]>(
  fields: readonly F[]
): F[] {
  const required = fields.filter(([, s]) => resolve(s).kind !== "opt")
  const optional = fields.filter(([, s]) => resolve(s).kind === "opt")
  return [...required, ...optional]
}

/**
 * `obj[key] = v` with key "__proto__" sets the prototype instead of an own
 * property, and validate() then reports missing_field. Candid allows any
 * label, so every keyed write of a value or a draft goes through this.
 */
export function setOwn<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

/** Own-property read: `fields["toString"]` must not find Object.prototype's. */
export function getOwn<T>(
  obj: Readonly<Record<string, T>>,
  key: string
): T | undefined {
  return Object.hasOwn(obj, key) ? obj[key] : undefined
}

/** A copy of `obj` with `key` set, safe for any key. */
export function withOwn<T>(
  obj: Readonly<Record<string, T>>,
  key: string,
  value: T
): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of Object.keys(obj)) setOwn(out, k, obj[k] as T)
  setOwn(out, key, value)
  return out
}

/**
 * Whether a value is a `Uint8Array`, from this realm or another (a jsdom
 * test's TextEncoder, an iframe): how `@meantjs/schema`'s codec recognizes a
 * blob.
 */
export function isBytes(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]"
  )
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** A child's path in the codec's grammar: `$.to.owner`, `$["a b"]`, `$[3]`. */
export function childPath(path: string, seg: string | number): string {
  if (typeof seg === "number") return `${path}[${seg}]`
  return IDENT.test(seg) ? `${path}.${seg}` : `${path}[${JSON.stringify(seg)}]`
}

/**
 * The numeric id of a key `_N_`, the schema's spelling of an unnamed Candid
 * label (a copy of `@meantjs/schema`'s internal `numericKeyId`).
 */
export function numericLabelId(key: string): number | undefined {
  const match = /^_([0-9]+)_$/.exec(key)
  const digits = match?.[1]
  if (digits === undefined) return undefined
  if (digits.length > 1 && digits.startsWith("0")) return undefined
  const id = Number(digits)
  return Number.isSafeInteger(id) && id < 4_294_967_296 ? id : undefined
}

/** A field or arm label for people: the name, or `#N` for an unnamed label. */
export function displayLabel(key: string): string {
  const id = numericLabelId(key)
  return id === undefined ? key : `#${id}`
}
