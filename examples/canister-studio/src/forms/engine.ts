// The form engine: a draft tree over @candid-core/schema's public API, with
// no React in it. Ported from the candid-forms lab (engine.ts), with its
// fixes: own-property reads and writes for keys like "__proto__",
// inhabitation-aware defaults, a tolerant draftFromValue, and issues on the
// codec's `$args[i]…` paths.
//
// Value model: exactly what validate()/encodeArgs() and ic-reactor accept.
//   bigint (nat, int, nat64, int64) | number (nat8…int32, float32/64)
//   | string (text) | boolean | null | Principal (canonical text)
//   | Uint8Array (blob) | T | null (opt) | { some: T } | null (boxed opt)
//   | T[] (vec) | {} (unit) | object (record) | array (tuple)
//   | { tag } / { tag, value } (variant) | { principal, method } (func)
//   | Principal (service)
import {
  isBoxedOpt,
  isPrincipal,
  type AnyFieldSchema,
  type AnySchema,
  type ResolvedNode,
} from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { validate } from "@candid-core/schema/validate"
import { toHex } from "../lib/hex.ts"
import { toVars } from "../lib/reactor.ts"
import {
  armOf,
  armsOf,
  childPath,
  displayLabel,
  elementsOf,
  fieldsOf,
  getOwn,
  isBytes,
  isTagOnly,
  numericLabelId,
  orderFields,
  resolve,
  setOwn,
  withOwn,
  type RecordNode,
  type TupleNode,
  type VariantNode,
} from "../lib/schema.ts"

// Resolution, typed accessors, own-property access and labels live in
// lib/schema.ts (the value viewers use them too); the engine re-exports them
// as part of its surface.
export {
  armOf,
  armsOf,
  childPath,
  displayLabel,
  elementsOf,
  fieldsOf,
  getOwn,
  isBytes,
  numericLabelId,
  orderFields,
  resolve,
  setOwn,
  withOwn,
}

// ---------------------------------------------------------------------------
// Paths: validate()'s grammar. `$`, `.ident`, `["quoted key"]`, `[index]`.
// An unboxed opt's inner shares the opt's path; a boxed opt's inner is
// `.some`; a variant's payload is `.value` (tag issues at `.tag`); a func
// reference's parts are `.principal` and `.method`.
// ---------------------------------------------------------------------------

/** Namespaces a per-argument `$…` path the way encodeArgs reports: `$args[i]…`. */
export function argPath(index: number, path = "$"): string {
  return `$args[${index}]${path.slice(1)}`
}

/**
 * A path for people: `$args[0].to.owner` → "to.owner" for a one-argument
 * method, "arg1.to.owner" for `$args[1]…` of several.
 */
export function pathLabel(path: string, argCount: number): string {
  const match = /^\$args\[(\d+)\](.*)$/.exec(path)
  if (match === null) return path === "$" ? "arguments" : path
  const [, index, rest = ""] = match
  if (argCount === 1) {
    const tail = rest.startsWith(".") ? rest.slice(1) : rest
    return tail === "" ? "argument" : tail
  }
  return `arg${index}${rest}`
}

// ---------------------------------------------------------------------------
// Controls: which editor a resolved node calls for.
// ---------------------------------------------------------------------------

const FIXED: Readonly<Record<string, readonly [number, number]>> = {
  nat8: [0, 255],
  nat16: [0, 65_535],
  nat32: [0, 4_294_967_295],
  int8: [-128, 127],
  int16: [-32_768, 32_767],
  int32: [-2_147_483_648, 2_147_483_647],
}
const BIG: Readonly<Record<string, { min?: bigint; max?: bigint }>> = {
  nat: { min: 0n },
  int: {},
  nat64: { min: 0n, max: 2n ** 64n - 1n },
  int64: { min: -(2n ** 63n), max: 2n ** 63n - 1n },
}

export interface ArmControl {
  readonly tag: string
  readonly tagOnly: boolean
  /** No finite value exists for the payload: the arm cannot be chosen. */
  readonly uninhabited: boolean
  readonly schema: AnyFieldSchema
}

export type Control =
  | { readonly control: "text" }
  | { readonly control: "bool" }
  | {
      readonly control: "bigint"
      readonly primitive: string
      readonly min?: bigint
      readonly max?: bigint
    }
  | {
      readonly control: "integer"
      readonly primitive: string
      readonly min: number
      readonly max: number
    }
  | { readonly control: "float"; readonly bits: 32 | 64 }
  | { readonly control: "principal" }
  | { readonly control: "fixed"; readonly what: "null" | "reserved" | "unit" }
  | { readonly control: "uninhabited" }
  | { readonly control: "bytes" }
  | {
      readonly control: "optional"
      readonly boxed: boolean
      readonly inner: AnyFieldSchema
    }
  | { readonly control: "list"; readonly item: AnyFieldSchema }
  | {
      readonly control: "group"
      readonly fields: readonly (readonly [string, AnyFieldSchema])[]
    }
  | { readonly control: "tuple"; readonly elements: readonly AnyFieldSchema[] }
  | { readonly control: "choice"; readonly arms: readonly ArmControl[] }
  | { readonly control: "funcReference"; readonly mode: string }
  | { readonly control: "serviceReference" }

const controls = new WeakMap<ResolvedNode, Control>()

export function controlOf(schema: AnyFieldSchema): Control {
  const node = resolve(schema)
  let control = controls.get(node)
  if (control === undefined) {
    control = computeControl(node)
    controls.set(node, control)
  }
  return control
}

function computeControl(node: ResolvedNode): Control {
  switch (node.kind) {
    case "primitive": {
      const p = node.primitive
      const big = BIG[p]
      const fixed = FIXED[p]
      if (p === "text") return { control: "text" }
      if (p === "bool") return { control: "bool" }
      if (big !== undefined) return { control: "bigint", primitive: p, ...big }
      if (fixed !== undefined)
        return {
          control: "integer",
          primitive: p,
          min: fixed[0],
          max: fixed[1],
        }
      if (p === "float32") return { control: "float", bits: 32 }
      if (p === "float64") return { control: "float", bits: 64 }
      if (p === "principal") return { control: "principal" }
      if (p === "null" || p === "reserved") return { control: "fixed", what: p }
      if (p === "empty") return { control: "uninhabited" }
      throw new TypeError(`unknown primitive ${p}`)
    }
    case "opt":
      return { control: "optional", boxed: isBoxedOpt(node), inner: node.inner }
    case "vec":
      return { control: "list", item: node.inner }
    case "blob":
      return { control: "bytes" }
    case "unit":
      return { control: "fixed", what: "unit" }
    case "record":
      return { control: "group", fields: fieldsOf(node) }
    case "tuple":
      return { control: "tuple", elements: elementsOf(node) }
    case "variant":
      return {
        control: "choice",
        arms: armsOf(node).map(([tag, schema]) => ({
          tag,
          tagOnly: isTagOnly(schema),
          uninhabited: isUninhabited(schema),
          schema,
        })),
      }
    case "func":
      return { control: "funcReference", mode: node.mode }
    case "service":
      return { control: "serviceReference" }
    default: {
      const never: never = node
      throw new TypeError(`unknown kind ${(never as { kind: string }).kind}`)
    }
  }
}

/** Whether a field is optional (`opt`), so it may be left out (null). */
export function isOptional(schema: AnyFieldSchema): boolean {
  return resolve(schema).kind === "opt"
}

/** A short Candid type for labels: "nat", "opt blob", "vec record", "variant". */
export function typeName(schema: AnyFieldSchema, depth = 0): string {
  const node = resolve(schema)
  switch (node.kind) {
    case "primitive":
      return node.primitive
    case "opt":
      return depth > 1 ? "opt …" : `opt ${typeName(node.inner, depth + 1)}`
    case "vec":
      return depth > 1 ? "vec …" : `vec ${typeName(node.inner, depth + 1)}`
    case "blob":
      return "blob"
    case "unit":
      return "record {}"
    case "record":
      return "record"
    case "tuple":
      return `tuple (${elementsOf(node).length})`
    case "variant":
      return "variant"
    case "func":
      return node.mode === "update" ? "func" : `func ${node.mode}`
    case "service":
      return "service"
  }
}

// ---------------------------------------------------------------------------
// Default values: the first finite value of each type, inhabitation-aware.
// opt → null and vec → [] break every legal recursion; a variant takes its
// first arm (in key order) with a finite value; a cycle on the active path,
// or `empty`, has none. Principals have no sensible default: "" (fails, so
// the field says "required") unless options.principal is given.
// ---------------------------------------------------------------------------

export const UNINHABITED: unique symbol = Symbol("uninhabited")

export interface DefaultOptions {
  /** Fills principal fields (e.g. the caller); otherwise they start empty. */
  readonly principal?: string
}

export function defaultValue(
  schema: AnyFieldSchema,
  options: DefaultOptions = {}
): unknown {
  return defaultAt(schema, options, new Set())
}

const inhabitation = new WeakMap<ResolvedNode, boolean>()

/** Whether no finite value of the type exists (`empty`, `record { x : Loop }`). */
export function isUninhabited(schema: AnyFieldSchema): boolean {
  const node = resolve(schema)
  let empty = inhabitation.get(node)
  if (empty === undefined) {
    // A fresh active set: the answer is then independent of where it is asked.
    empty = defaultAt(schema, {}, new Set()) === UNINHABITED
    inhabitation.set(node, empty)
  }
  return empty
}

function defaultAt(
  schema: AnyFieldSchema,
  options: DefaultOptions,
  active: Set<object>
): unknown {
  const node = resolve(schema)
  if (active.has(node)) return UNINHABITED
  active.add(node)
  try {
    switch (node.kind) {
      case "primitive":
        switch (node.primitive) {
          case "null":
          case "reserved":
            return null
          case "bool":
            return false
          case "text":
            return ""
          case "principal":
            return options.principal ?? ""
          case "empty":
            return UNINHABITED
          case "nat":
          case "int":
          case "nat64":
          case "int64":
            return 0n
          default:
            return 0 // nat8…int32, float32, float64
        }
      case "opt":
        return null
      case "vec":
        return []
      case "blob":
        return new Uint8Array(0)
      case "unit":
        return {}
      case "record": {
        const out: Record<string, unknown> = {}
        for (const [key, field] of fieldsOf(node)) {
          const value = defaultAt(field, options, active)
          if (value === UNINHABITED) return UNINHABITED
          setOwn(out, key, value)
        }
        return out
      }
      case "tuple": {
        const out: unknown[] = []
        for (const element of elementsOf(node)) {
          const value = defaultAt(element, options, active)
          if (value === UNINHABITED) return UNINHABITED
          out.push(value)
        }
        return out
      }
      case "variant":
        for (const [tag, arm] of armsOf(node)) {
          if (isTagOnly(arm)) return { tag }
          const value = defaultAt(arm, options, active)
          if (value !== UNINHABITED) return { tag, value }
        }
        return UNINHABITED
      case "func":
        return { principal: options.principal ?? "", method: "" }
      case "service":
        return options.principal ?? ""
    }
  } finally {
    active.delete(node)
  }
}

// ---------------------------------------------------------------------------
// Draft: the editable state. Leaves hold raw text (so "-", "1_000", "0x" and
// half-typed principals never break the tree); an opt keeps its inner draft
// while toggled off; a variant keeps one payload draft per arm visited; vec
// items carry stable ids for React keys.
// ---------------------------------------------------------------------------

export type BytesFormat = "hex" | "utf8" | "base64"

/**
 * The editable state of one value: JSON-serializable, mirrors the schema.
 * Leaves hold raw text; an opt keeps its inner draft while toggled off; a
 * variant keeps one payload draft per arm visited; vec items carry stable ids
 * (React keys).
 */
export type Draft =
  | { readonly k: "leaf"; readonly text: string }
  | { readonly k: "bool"; readonly value: boolean }
  | { readonly k: "fixed" }
  | { readonly k: "bytes"; readonly text: string; readonly format: BytesFormat }
  | { readonly k: "opt"; readonly present: boolean; readonly inner?: Draft }
  | {
      readonly k: "vec"
      readonly items: readonly { readonly id: number; readonly draft: Draft }[]
    }
  | { readonly k: "record"; readonly fields: Readonly<Record<string, Draft>> }
  | { readonly k: "tuple"; readonly items: readonly Draft[] }
  | {
      readonly k: "variant"
      readonly tag: string
      readonly payloads: Readonly<Record<string, Draft>>
    }
  | { readonly k: "func"; readonly principal: string; readonly method: string }
  | { readonly k: "uninhabited" }

// Vec item ids are React keys only, never rendered into the DOM, so a
// counter that differs between the server and the browser is harmless.
let nextItemId = 1
export const newItemId = (): number => nextItemId++

/** A fresh draft for a schema: its default value, as a draft. */
export function initialDraft(
  schema: AnyFieldSchema,
  opts: DefaultOptions = {}
): Draft {
  return draftFromValue(schema, defaultValue(schema, opts), opts)
}

const BIG_PRIMITIVES = new Set(["nat", "int", "nat64", "int64"])

/**
 * A draft from any value, tolerantly: a domain value (prefill, history,
 * resendOf) or loose JSON: digit strings for bigints, hex strings or
 * `number[]` for blobs, `{ Tag: payload }` variants, `[]`/`[v]` opts,
 * objects with `toText()` for principals. Anything unusable at a node falls
 * back to that node's default.
 */
export function draftFromValue(
  schema: AnyFieldSchema,
  value: unknown,
  opts: DefaultOptions = {}
): Draft {
  if (value === UNINHABITED) return { k: "uninhabited" }
  const node = resolve(schema)
  const fallback = (): Draft => {
    const d = defaultValue(schema, opts)
    return d === UNINHABITED || d === value
      ? { k: "uninhabited" }
      : draftFromValue(schema, d, opts)
  }
  switch (node.kind) {
    case "primitive":
      switch (node.primitive) {
        case "null":
        case "reserved":
          return { k: "fixed" }
        case "empty":
          return { k: "uninhabited" }
        case "bool":
          return { k: "bool", value: value === true || value === "true" }
        case "principal":
          return { k: "leaf", text: principalText(value) }
        default:
          return { k: "leaf", text: leafText(node.primitive, value) }
      }
    case "blob":
      if (isBytes(value))
        return { k: "bytes", text: toHex(value), format: "hex" }
      if (Array.isArray(value) && value.every(isByte))
        return {
          k: "bytes",
          text: toHex(Uint8Array.from(value)),
          format: "hex",
        }
      return {
        k: "bytes",
        text: typeof value === "string" ? value : "",
        format: "hex",
      }
    case "unit":
      return { k: "fixed" }
    case "opt": {
      if (value === null || value === undefined)
        return { k: "opt", present: false }
      if (isBoxedOpt(node)) {
        const some =
          typeof value === "object" && Object.hasOwn(value, "some")
            ? (value as { some: unknown }).some
            : value
        return {
          k: "opt",
          present: true,
          inner: draftFromValue(node.inner, some, opts),
        }
      }
      // agent-js writes an opt as [] or [value]. Only read it so when the
      // inner type cannot itself be an array.
      if (Array.isArray(value) && !holdsArray(node.inner)) {
        if (value.length === 0) return { k: "opt", present: false }
        return {
          k: "opt",
          present: true,
          inner: draftFromValue(node.inner, value[0], opts),
        }
      }
      return {
        k: "opt",
        present: true,
        inner: draftFromValue(node.inner, value, opts),
      }
    }
    case "vec":
      return {
        k: "vec",
        items: Array.isArray(value)
          ? value.map((v) => ({
              id: newItemId(),
              draft: draftFromValue(node.inner, v, opts),
            }))
          : [],
      }
    case "record": {
      if (typeof value !== "object" || value === null) return fallback()
      const src = value as Record<string, unknown>
      const fields: Record<string, Draft> = {}
      for (const [key, field] of fieldsOf(node)) {
        setOwn(
          fields,
          key,
          Object.hasOwn(src, key)
            ? draftFromValue(field, src[key], opts)
            : initialDraft(field, opts)
        )
      }
      return { k: "record", fields }
    }
    case "tuple": {
      if (!Array.isArray(value)) return fallback()
      return {
        k: "tuple",
        items: elementsOf(node).map((el, i) =>
          i < value.length
            ? draftFromValue(el, value[i], opts)
            : initialDraft(el, opts)
        ),
      }
    }
    case "variant": {
      const picked = variantOf(node, value)
      if (picked === undefined) return fallback()
      const [tag, payload, armSchema] = picked
      if (isTagOnly(armSchema)) return { k: "variant", tag, payloads: {} }
      const payloads: Record<string, Draft> = {}
      setOwn(
        payloads,
        tag,
        payload === undefined
          ? initialDraft(armSchema, opts)
          : draftFromValue(armSchema, payload, opts)
      )
      return { k: "variant", tag, payloads }
    }
    case "func": {
      const f = (typeof value === "object" && value !== null ? value : {}) as {
        principal?: unknown
        method?: unknown
      }
      return {
        k: "func",
        principal: principalText(f.principal),
        method: typeof f.method === "string" ? f.method : "",
      }
    }
    case "service":
      return { k: "leaf", text: principalText(value) }
  }
}

const isByte = (b: unknown): b is number =>
  typeof b === "number" && Number.isInteger(b) && b >= 0 && b < 256

function holdsArray(schema: AnyFieldSchema): boolean {
  const kind = resolve(schema).kind
  return kind === "vec" || kind === "tuple" || kind === "blob" || kind === "opt"
}

function leafText(primitive: string, value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "number") {
    // A JSON number past 2^53 already lost digits: leave the field empty
    // rather than show a different amount.
    if (BIG_PRIMITIVES.has(primitive))
      return Number.isSafeInteger(value) ? String(value) : ""
    return String(value)
  }
  return ""
}

/** The `[tag, payload, armSchema]` of a `{ tag, value }` or `{ Tag: payload }` value. */
function variantOf(
  node: VariantNode,
  value: unknown
): [string, unknown, AnyFieldSchema] | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const v = value as Record<string, unknown>
  if (typeof v.tag === "string") {
    const arm = armOf(node, v.tag)
    if (arm !== undefined) return [v.tag, v.value, arm]
  }
  const keys = Object.keys(v)
  const only = keys.length === 1 ? keys[0] : undefined
  if (only !== undefined) {
    const arm = armOf(node, only)
    if (arm !== undefined) return [only, v[only], arm]
  }
  return undefined
}

function principalText(value: unknown): string {
  if (typeof value === "string") return value
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toText?: unknown }).toText === "function"
  )
    return String((value as { toText(): unknown }).toText())
  return ""
}

/** Switching a variant: keeps the draft of every arm already visited. */
export function selectArm(
  schema: AnyFieldSchema,
  draft: Draft,
  tag: string,
  opts: DefaultOptions = {}
): Draft {
  const node = resolve(schema)
  if (node.kind !== "variant") return draft
  const arm = armOf(node, tag)
  if (arm === undefined) return draft
  const payloads = draft.k === "variant" ? draft.payloads : {}
  if (isTagOnly(arm) || getOwn(payloads, tag) !== undefined)
    return { k: "variant", tag, payloads }
  return {
    k: "variant",
    tag,
    payloads: withOwn(payloads, tag, initialDraft(arm, opts)),
  }
}

// ---------------------------------------------------------------------------
// Draft → value. A parse failure becomes an issue at the leaf's path (code
// "parse"); the raw text stays in the value as a placeholder so validate()
// still sees the slot, and the parse message wins for that path.
// ---------------------------------------------------------------------------

/**
 * An issue at a field. `path` uses the codec's grammar under `$args[i]`
 * (`$args[0].to.owner`), the same paths ic-reactor's `invalid_args` issues
 * carry, so both land on the same field.
 */
export interface FieldIssue {
  path: string
  code: string
  message: string
}

export function draftToValue(
  schema: AnyFieldSchema,
  draft: Draft,
  path: string,
  issues: FieldIssue[]
): unknown {
  const node = resolve(schema)
  const parse = (message: string): void => {
    issues.push({ path, code: "parse", message })
  }
  switch (node.kind) {
    case "primitive": {
      const p = node.primitive
      if (p === "null" || p === "reserved") return null
      if (p === "empty") {
        parse("this type has no values")
        return null
      }
      if (p === "bool") return draft.k === "bool" ? draft.value : false
      const text = draft.k === "leaf" ? draft.text : ""
      if (p === "text") return text
      if (p === "principal") return principalOrIssue(text, parse)
      if (BIG_PRIMITIVES.has(p)) {
        const parsed = parseBigInt(text)
        if (typeof parsed === "string") {
          parse(parsed)
          return text
        }
        return parsed
      }
      if (FIXED[p] !== undefined) {
        const t = text.trim().replace(/[_,\s]/g, "")
        if (!/^[+-]?\d+$/.test(t)) {
          parse(t === "" ? "required" : "enter a whole number")
          return text
        }
        return Number(t) // the range is validate's out_of_range, with exact bounds
      }
      return parseFloatLeaf(text, p === "float32", parse)
    }
    case "blob": {
      if (draft.k !== "bytes") return new Uint8Array(0)
      const bytes = parseBytes(draft.text, draft.format)
      if (typeof bytes === "string") {
        parse(bytes)
        return draft.text
      }
      return bytes
    }
    case "unit":
      return {}
    case "opt": {
      if (draft.k !== "opt" || !draft.present) return null
      const boxed = isBoxedOpt(node)
      const innerDraft = draft.inner ?? initialDraft(node.inner)
      const inner = draftToValue(
        node.inner,
        innerDraft,
        boxed ? childPath(path, "some") : path,
        issues
      )
      return boxed ? { some: inner } : inner
    }
    case "vec":
      return draft.k === "vec"
        ? draft.items.map((item, i) =>
            draftToValue(node.inner, item.draft, childPath(path, i), issues)
          )
        : []
    case "record": {
      const out: Record<string, unknown> = {}
      for (const [key, field] of fieldsOf(node)) {
        const sub = draft.k === "record" ? getOwn(draft.fields, key) : undefined
        setOwn(
          out,
          key,
          draftToValue(
            field,
            sub ?? initialDraft(field),
            childPath(path, key),
            issues
          )
        )
      }
      return out
    }
    case "tuple":
      return elementsOf(node).map((el, i) => {
        const sub = draft.k === "tuple" ? draft.items[i] : undefined
        return draftToValue(
          el,
          sub ?? initialDraft(el),
          childPath(path, i),
          issues
        )
      })
    case "variant": {
      if (draft.k !== "variant") return null
      const armSchema = armOf(node, draft.tag)
      if (armSchema === undefined) {
        issues.push({
          path: childPath(path, "tag"),
          code: "parse",
          message: `unknown variant tag ${JSON.stringify(draft.tag)}`,
        })
        return { tag: draft.tag }
      }
      if (isTagOnly(armSchema)) return { tag: draft.tag }
      const payload =
        getOwn(draft.payloads, draft.tag) ?? initialDraft(armSchema)
      return {
        tag: draft.tag,
        value: draftToValue(
          armSchema,
          payload,
          childPath(path, "value"),
          issues
        ),
      }
    }
    case "func": {
      const f = draft.k === "func" ? draft : { principal: "", method: "" }
      const principal = principalOrIssue(f.principal, (message) =>
        issues.push({
          path: childPath(path, "principal"),
          code: "parse",
          message,
        })
      )
      const method = f.method.trim()
      if (method === "")
        issues.push({
          path: childPath(path, "method"),
          code: "parse",
          message: "required",
        })
      return { principal, method }
    }
    case "service":
      return principalOrIssue(draft.k === "leaf" ? draft.text : "", parse)
  }
}

function principalOrIssue(
  text: string,
  report: (message: string) => void
): string {
  const t = text.trim()
  if (t === "") report("required")
  else if (!isPrincipal(t)) {
    if (isPrincipal(t.toLowerCase())) report("principal text is lower case")
    else report("not a valid principal (wrong grouping or checksum)")
  }
  return t
}

function parseFloatLeaf(
  text: string,
  float32: boolean,
  parse: (message: string) => void
): number | string {
  const t = text.trim()
  const x =
    t === "NaN"
      ? NaN
      : t === "Infinity" || t === "+Infinity"
        ? Infinity
        : t === "-Infinity"
          ? -Infinity
          : t === ""
            ? NaN
            : Number(t)
  if (Number.isNaN(x) && t !== "NaN") {
    parse(t === "" ? "required" : "enter a number")
    return text
  }
  if (float32 && !Number.isNaN(x) && Math.fround(x) !== x) {
    // encode would refuse it too (unrepresentable_float32): say why, here.
    parse(`not exactly representable as float32 (nearest is ${Math.fround(x)})`)
    return x
  }
  return x
}

/** A bigint from typed text (`_`, `,` and spaces ignored; `0x` hex), or why not. */
export function parseBigInt(text: string): bigint | string {
  const t = text.trim().replace(/[_,\s]/g, "")
  if (t === "") return "required"
  if (/^[+-]?\d+$/.test(t)) return BigInt(t)
  if (/^0x[0-9a-f]+$/i.test(t)) return BigInt(t)
  return "enter a whole number"
}

/** Bytes from text in a format, or why not. Hex allows `0x` and separators. */
export function parseBytes(
  text: string,
  format: BytesFormat
): Uint8Array | string {
  // A copy, so the bytes are this realm's Uint8Array wherever the encoder
  // comes from (a test's jsdom window has its own).
  if (format === "utf8") return Uint8Array.from(new TextEncoder().encode(text))
  if (format === "base64") {
    try {
      const bin = atob(text.trim())
      return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    } catch {
      return "not valid base64"
    }
  }
  const t = text
    .trim()
    .replace(/^0x/i, "")
    .replace(/[\s:_-]/g, "")
  if (!/^[0-9a-f]*$/i.test(t)) return "not valid hex"
  if (t.length % 2 !== 0) return "hex needs an even number of digits"
  const out = new Uint8Array(t.length / 2)
  for (let i = 0; i < out.length; i++)
    out[i] = Number.parseInt(t.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * Bytes as text in a format, or `undefined` when the format cannot hold
 * them (utf8 for bytes that are not valid UTF-8).
 */
export function formatBytes(
  bytes: Uint8Array,
  format: BytesFormat
): string | undefined {
  if (format === "hex") return toHex(bytes)
  if (format === "base64") {
    let bin = ""
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// One check for a whole call: parse → validate (per argument) → encodeArgs.
// ---------------------------------------------------------------------------

/** The result of checking a whole call: parse → validate → encodeArgs. */
export interface CallCheck {
  ok: boolean
  /** One domain value per argument. */
  values?: unknown[]
  /** What ic-reactor's builders take: nothing, the one value, or the tuple. */
  vars?: unknown
  /** The exact Candid message (DIDL…) when everything passed. */
  bytes?: Uint8Array
  issues: FieldIssue[]
  /** Some argument has no finite value: the method cannot be called. */
  uninhabited?: boolean
}

/** The values the drafts stand for, parse failures left as their raw text. */
export function draftValues(
  args: readonly AnyFieldSchema[],
  drafts: readonly (Draft | undefined)[]
): unknown[] {
  return args.map((schema, i) =>
    draftToValue(schema, drafts[i] ?? initialDraft(schema), argPath(i), [])
  )
}

/** Checks a whole call; issues use `$args[i]…` paths. */
export function checkCall(
  args: readonly AnyFieldSchema[],
  drafts: readonly Draft[]
): CallCheck {
  const empty = args.findIndex(
    (schema, i) => drafts[i]?.k === "uninhabited" || isUninhabited(schema)
  )
  if (empty !== -1) {
    return {
      ok: false,
      uninhabited: true,
      issues: [
        {
          path: argPath(empty),
          code: "uninhabited_type",
          message:
            "this argument's type has no values (empty, or a type that only contains itself): the method cannot be called",
        },
      ],
    }
  }
  const parseIssues: FieldIssue[] = []
  const values = args.map((schema, i) =>
    draftToValue(
      schema,
      drafts[i] ?? initialDraft(schema),
      argPath(i),
      parseIssues
    )
  )
  const parsed = new Set(parseIssues.map((issue) => issue.path))
  const issues: FieldIssue[] = [...parseIssues]
  args.forEach((schema, i) => {
    // AnyFieldSchema includes Schema<never>, which validate()'s Schema<T>
    // parameter refuses at the type level; the node is the same.
    const result = validate(schema as AnySchema, values[i], { maxIssues: 50 })
    if (result.ok) return
    for (const issue of result.issues) {
      const path = argPath(i, issue.path)
      if (!parsed.has(path))
        issues.push({ path, code: issue.code, message: issue.message })
    }
  })
  const vars = toVars(values)
  if (issues.length > 0) return { ok: false, values, vars, issues }
  // encode re-validates (stopping at the first issue) and adds what only it
  // finds: lone surrogates in text, float32 rounding.
  const encoded = encodeArgs(args, values)
  if (!encoded.ok)
    return {
      ok: false,
      values,
      vars,
      issues: encoded.issues.map(({ path, code, message }) => ({
        path,
        code,
        message,
      })),
    }
  return { ok: true, values, vars, issues: [], bytes: encoded.bytes }
}

/** Issues grouped by path, for O(1) lookup from each field component. */
export function issuesByPath(
  issues: readonly FieldIssue[]
): Map<string, FieldIssue[]> {
  const map = new Map<string, FieldIssue[]>()
  for (const issue of issues) {
    const list = map.get(issue.path)
    if (list) list.push(issue)
    else map.set(issue.path, [issue])
  }
  return map
}

/** Whether `path` or anything below it has an issue (for collapsed sections). */
export function isAtOrBelow(issuePath: string, path: string): boolean {
  return (
    issuePath === path ||
    issuePath.startsWith(path + ".") ||
    issuePath.startsWith(path + "[")
  )
}

export function hasIssueBelow(
  issues: readonly FieldIssue[],
  path: string
): boolean {
  return issues.some((issue) => isAtOrBelow(issue.path, path))
}

/**
 * Every path the form renders for a value: what a field component registers.
 * The tests use it to prove each issue lands on a rendered field.
 */
export function renderedPaths(
  schema: AnyFieldSchema,
  value: unknown,
  path: string,
  out: Set<string> = new Set()
): Set<string> {
  out.add(path)
  const node = resolve(schema)
  switch (node.kind) {
    case "opt":
      if (value !== null && value !== undefined) {
        const boxed = isBoxedOpt(node)
        renderedPaths(
          node.inner,
          boxed ? (value as { some: unknown }).some : value,
          boxed ? childPath(path, "some") : path,
          out
        )
      }
      break
    case "vec":
      if (Array.isArray(value))
        value.forEach((v, i) =>
          renderedPaths(node.inner, v, childPath(path, i), out)
        )
      break
    case "record":
      for (const [key, field] of fieldsOf(node)) {
        const v =
          typeof value === "object" && value !== null
            ? getOwn(value as Record<string, unknown>, key)
            : undefined
        renderedPaths(field, v, childPath(path, key), out)
      }
      break
    case "tuple":
      elementsOf(node).forEach((el, i) =>
        renderedPaths(
          el,
          Array.isArray(value) ? value[i] : undefined,
          childPath(path, i),
          out
        )
      )
      break
    case "variant": {
      out.add(childPath(path, "tag"))
      const v = value as { tag?: unknown; value?: unknown } | null
      if (v !== null && typeof v === "object" && typeof v.tag === "string") {
        const arm = armOf(node, v.tag)
        if (arm !== undefined && "value" in v)
          renderedPaths(arm, v.value, childPath(path, "value"), out)
      }
      break
    }
    case "func":
      out.add(childPath(path, "principal"))
      out.add(childPath(path, "method"))
      break
    default:
      break
  }
  return out
}

// ---------------------------------------------------------------------------
// Walking drafts (for "now" defaults): visit every node of the drafts with
// its schema, path and record key; a visitor that returns a draft replaces
// that node and is not called below it.
// ---------------------------------------------------------------------------

export interface DraftVisit {
  readonly schema: AnyFieldSchema
  readonly draft: Draft
  readonly path: string
  /** The record key of the field, when the node is one. */
  readonly key?: string
}

export function mapDrafts(
  args: readonly AnyFieldSchema[],
  drafts: readonly Draft[],
  visit: (at: DraftVisit) => Draft | undefined
): Draft[] {
  return args.map((schema, i) => {
    const draft = drafts[i] ?? initialDraft(schema)
    return mapDraft({ schema, draft, path: argPath(i) }, visit)
  })
}

function mapDraft(
  at: DraftVisit,
  visit: (at: DraftVisit) => Draft | undefined
): Draft {
  const replaced = visit(at)
  if (replaced !== undefined) return replaced
  const { schema, draft, path, key } = at
  const node = resolve(schema)
  switch (node.kind) {
    case "opt": {
      if (draft.k !== "opt" || !draft.present || draft.inner === undefined)
        return draft
      const boxed = isBoxedOpt(node)
      const inner = mapDraft(
        {
          schema: node.inner,
          draft: draft.inner,
          path: boxed ? childPath(path, "some") : path,
          key: boxed ? undefined : key,
        },
        visit
      )
      return inner === draft.inner ? draft : { ...draft, inner }
    }
    case "record": {
      if (draft.k !== "record") return draft
      let changed = false
      const fields: Record<string, Draft> = {}
      for (const [k, field] of fieldsOf(node)) {
        const sub = getOwn(draft.fields, k)
        if (sub === undefined) continue
        const next = mapDraft(
          { schema: field, draft: sub, path: childPath(path, k), key: k },
          visit
        )
        if (next !== sub) changed = true
        setOwn(fields, k, next)
      }
      return changed ? { k: "record", fields } : draft
    }
    case "tuple": {
      if (draft.k !== "tuple") return draft
      const elements = elementsOf(node)
      const items = draft.items.map((sub, i) => {
        const el = elements[i]
        return el === undefined
          ? sub
          : mapDraft(
              { schema: el, draft: sub, path: childPath(path, i) },
              visit
            )
      })
      return items.every((d, i) => d === draft.items[i])
        ? draft
        : { k: "tuple", items }
    }
    case "variant": {
      if (draft.k !== "variant") return draft
      const arm = armOf(node, draft.tag)
      const payload = getOwn(draft.payloads, draft.tag)
      if (arm === undefined || payload === undefined) return draft
      const next = mapDraft(
        { schema: arm, draft: payload, path: childPath(path, "value") },
        visit
      )
      return next === payload
        ? draft
        : { ...draft, payloads: withOwn(draft.payloads, draft.tag, next) }
    }
    default:
      return draft
  }
}

/**
 * The draft set to a time in nanoseconds: a bigint leaf takes it, an opt is
 * switched on and filled, a one-field record (the ICP ledger's
 * `TimeStamp { timestamp_nanos }`) fills its field. Other nodes stay as they are.
 */
export function fillNanos(
  schema: AnyFieldSchema,
  draft: Draft,
  nanos: bigint
): Draft {
  const node = resolve(schema)
  switch (node.kind) {
    case "primitive":
      return BIG_PRIMITIVES.has(node.primitive)
        ? { k: "leaf", text: nanos.toString() }
        : draft
    case "opt": {
      const inner =
        draft.k === "opt" && draft.inner !== undefined
          ? draft.inner
          : initialDraft(node.inner)
      return {
        k: "opt",
        present: true,
        inner: fillNanos(node.inner, inner, nanos),
      }
    }
    case "record": {
      const fields = fieldsOf(node)
      const only = fields.length === 1 ? fields[0] : undefined
      if (only === undefined) return draft
      const [key, field] = only
      const current =
        draft.k === "record" ? getOwn(draft.fields, key) : undefined
      const out: Record<string, Draft> = {}
      setOwn(out, key, fillNanos(field, current ?? initialDraft(field), nanos))
      return { k: "record", fields: out }
    }
    default:
      return draft
  }
}

/** Whether a draft holds no time yet (an absent opt, an empty or zero leaf). */
export function isUnsetTime(draft: Draft): boolean {
  if (draft.k === "opt") return !draft.present
  if (draft.k === "leaf") return draft.text.trim() === "" || draft.text === "0"
  return false
}

// ---------------------------------------------------------------------------
// Errors from a call
// ---------------------------------------------------------------------------

interface IssueLike {
  path: unknown
  code: unknown
  message: unknown
}

const isIssue = (issue: unknown): issue is FieldIssue =>
  typeof issue === "object" &&
  issue !== null &&
  typeof (issue as IssueLike).path === "string" &&
  typeof (issue as IssueLike).code === "string" &&
  typeof (issue as IssueLike).message === "string"

/**
 * An `invalid_args` ReactorError's issues as field issues. ic-reactor takes
 * them straight from encodeArgs, so their paths are already `$args[i]…`, the
 * grammar the form's fields use. Any other error gives none. The check is on
 * the shape, not the brand, so a recorded error (a plain object with `kind`
 * and `issues`) is read too.
 */
export function issuesFromReactorError(e: unknown): FieldIssue[] {
  if (typeof e !== "object" || e === null) return []
  const error = e as { kind?: unknown; issues?: unknown }
  if (error.kind !== "invalid_args" || !Array.isArray(error.issues)) return []
  return error.issues
    .filter(isIssue)
    .map(({ path, code, message }) => ({ path, code, message }))
}
