// Schema reading helpers shared by the JSON walks, the JSON Schema writer and
// the Candid text printers, over @meantjs/schema's public API only. Ported
// from canister-studio's lib/schema.ts.
import {
  resolveSchema,
  type AnyFieldSchema,
  type ResolvedNode,
} from "@meantjs/schema"

export type RecordNode = Extract<ResolvedNode, { kind: "record" }>
export type TupleNode = Extract<ResolvedNode, { kind: "tuple" }>
export type VariantNode = Extract<ResolvedNode, { kind: "variant" }>
export type OptNode = Extract<ResolvedNode, { kind: "opt" }>
export type FuncNode = Extract<ResolvedNode, { kind: "func" }>
export type ServiceNode = Extract<ResolvedNode, { kind: "service" }>

// Generated modules build a fresh node on every `rec` body() call: memoizing
// on the schema object gives one node per declaration, so a walk can tell a
// recursive type by identity. Loaded schemas are already one node per type.
const resolved = new WeakMap<object, ResolvedNode>()

/**
 * The schema with every `rec` followed: what `.kind` can be read on.
 *
 * @throws TypeError on what is not a schema, and on a `rec` chain that never
 * ends (`resolveSchema`'s programmer errors).
 */
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

/** The schema of field `key`, read as an own property ("toString" is a field name too). */
export function fieldOf(
  node: RecordNode,
  key: string
): AnyFieldSchema | undefined {
  return getOwn(node.fields as Record<string, AnyFieldSchema>, key)
}

/** The arm schema of `tag`, read as an own property ("toString" is a valid tag). */
export function armOf(
  node: VariantNode,
  tag: string
): AnyFieldSchema | undefined {
  return getOwn(node.arms as Record<string, AnyFieldSchema>, tag)
}

/** A service's methods, each resolved to its func node, in schema order. */
export function methodsOf(
  node: ServiceNode
): readonly (readonly [string, ResolvedNode])[] {
  return Object.entries(node.methods).map(([name, method]) => [
    name,
    resolve(method),
  ])
}

/** Whether a variant arm carries no payload (its type is `null`). */
export function isTagOnly(arm: AnyFieldSchema): boolean {
  const node = resolve(arm)
  return node.kind === "primitive" && node.primitive === "null"
}

/** Whether a schema's values include no value at all (`empty`). */
export function isEmptyType(schema: AnyFieldSchema): boolean {
  const node = resolve(schema)
  return node.kind === "primitive" && node.primitive === "empty"
}

/**
 * Whether a resolved node's domain admits `null`: an opt over one of these
 * boxes its present value as `{ some }`. The rule `isBoxedOpt` states, applied
 * to a node already resolved.
 */
export function admitsNull(node: ResolvedNode): boolean {
  return (
    node.kind === "opt" ||
    (node.kind === "primitive" &&
      (node.primitive === "null" || node.primitive === "reserved"))
  )
}

/** Whether an opt node's present value is boxed (`opt opt T`, `opt null`, `opt reserved`). */
export function isBoxed(node: OptNode): boolean {
  return admitsNull(resolve(node.inner))
}

/**
 * `obj[key] = v` with key "__proto__" sets the prototype instead of an own
 * property, and validate() then reports missing_field. Candid allows any
 * label, so every keyed write of a value or a schema map goes through this.
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

/**
 * Whether `key` is an own enumerable property of `obj`: what validate and the
 * encoder count as present, and what JSON.parse creates.
 */
export function hasOwnEnumerable(obj: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(obj, key)
}

// The %TypedArray%.prototype[@@toStringTag] getter reads the internal slot:
// "Uint8Array" for a genuine Uint8Array from any realm (a Node Buffer
// included) and undefined for a prototype forgery. The check validate uses.
const typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  Symbol.toStringTag
)?.get

/** Whether a value is a `Uint8Array`, as `@meantjs/schema` recognizes a blob. */
export function isBytes(value: unknown): value is Uint8Array {
  return typedArrayTag?.call(value) === "Uint8Array"
}

/** A non-null object that is not an array or bytes: a record, variant or box. */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isBytes(value)
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
