import { isBoxedOpt, type AnyFieldSchema } from "@candid-core/schema"
import {
  armOf,
  childPath,
  elementsOf,
  fieldsOf,
  isBytes,
  isTagOnly,
  numericLabelId,
  ownValue,
  resolve,
} from "./schema.ts"

// Candid's textual value syntax, as the Candid spec and didc read it:
//   text       "a \"quoted\" line\n"          principal  principal "aaaaa-aa"
//   numbers    1_000 : nat, -5 : int8, 1.5 : float64 (always annotated)
//   blob       blob "\00\ff" or blob "ascii" (didc's rule)
//   opt        null, opt "x", opt (5 : nat)  (an annotated value needs parens)
//   vec        vec { 1 : nat8; 2 : nat8 }
//   record     record { owner = principal "…"; 7 = true }, tuples unlabelled
//   variant    variant { Ok = 5 : nat }, variant { Pending }
//   func       func "ryjl3-tyaaa-aaaaa-aaaba-cai".icrc1_name
//   service    service "ryjl3-tyaaa-aaaaa-aaaba-cai"
// A field value, a vec element, a variant payload and an argument may each be
// annotated (`<annval>` in the grammar); the operand of `opt` may not.

export interface CandidTextOptions {
  /**
   * Break groups that do not fit this many columns onto indented lines.
   * Without it, the text is one line.
   */
  readonly width?: number
}

/**
 * A value as Candid text: `record { owner = principal "…"; amount = 5 : nat }`.
 * Numbers carry their type annotation, so the text means the same value with
 * or without the .did at hand. Valid in an argument list, a field or a vec
 * element.
 *
 * @throws TypeError when `value` does not have the schema's shape; the
 * message names the path (`$.to.owner`).
 */
export function candidText(
  schema: AnyFieldSchema,
  value: unknown,
  options?: CandidTextOptions
): string {
  return render(valueDoc(schema, value, "$"), options)
}

/**
 * A call's arguments (or a reply's values) as Candid text: `(arg0, arg1)`,
 * what `dfx canister call` and `didc encode` read.
 *
 * @throws TypeError when the counts differ or a value does not fit its schema.
 */
export function candidArgsText(
  args: readonly AnyFieldSchema[],
  values: readonly unknown[],
  options?: CandidTextOptions
): string {
  if (args.length !== values.length) {
    throw new TypeError(
      `${args.length} argument types for ${values.length} values`
    )
  }
  const items = args.map((schema, i) =>
    valueDoc(schema, values[i], `$args[${i}]`)
  )
  return render(group("(", items, ",", ")", false), options)
}

// ---------------------------------------------------------------------------
// A tiny layout model: a group fits on one line or puts one item per line.
// ---------------------------------------------------------------------------

type Doc =
  | string
  | { readonly parts: readonly Doc[] }
  | {
      readonly open: string
      readonly items: readonly Doc[]
      readonly separator: string
      readonly close: string
      /** `record { a }` has spaces inside its braces, `(a)` does not. */
      readonly padded: boolean
    }

function group(
  open: string,
  items: readonly Doc[],
  separator: string,
  close: string,
  padded = true
): Doc {
  return { open, items, separator, close, padded }
}

const flatCache = new WeakMap<object, string>()

function flat(doc: Doc): string {
  if (typeof doc === "string") return doc
  const cached = flatCache.get(doc)
  if (cached !== undefined) return cached
  let text: string
  if ("parts" in doc) {
    text = doc.parts.map(flat).join("")
  } else if (doc.items.length === 0) {
    text = `${doc.open}${doc.close}`
  } else {
    const inner = doc.items.map(flat).join(`${doc.separator} `)
    text = doc.padded
      ? `${doc.open} ${inner} ${doc.close}`
      : `${doc.open}${inner}${doc.close}`
  }
  flatCache.set(doc, text)
  return text
}

function render(doc: Doc, options: CandidTextOptions | undefined): string {
  const width = options?.width
  return width === undefined ? flat(doc) : pretty(doc, 0, 0, width)
}

/**
 * `trailing` is how many characters follow the doc on its last line (a
 * separator), so a line is broken before it would overflow because of them.
 */
function pretty(
  doc: Doc,
  indent: number,
  column: number,
  width: number,
  trailing = 0
): string {
  const oneLine = flat(doc)
  if (typeof doc === "string" || column + oneLine.length + trailing <= width) {
    return oneLine
  }
  if ("parts" in doc) {
    let out = ""
    let col = column
    doc.parts.forEach((part, i) => {
      const after = doc.parts
        .slice(i + 1)
        .reduce((sum, next) => sum + flat(next).length, trailing)
      const text = pretty(part, indent, col, width, after)
      out += text
      const newline = text.lastIndexOf("\n")
      col = newline === -1 ? col + text.length : text.length - newline - 1
    })
    return out
  }
  if (doc.items.length === 0) return oneLine
  const inner = " ".repeat(indent + 2)
  const last = doc.items.length - 1
  const lines = doc.items.map((item, i) => {
    const separator = i < last ? doc.separator : ""
    const text = pretty(item, indent + 2, indent + 2, width, separator.length)
    return `\n${inner}${text}${separator}`
  })
  return `${doc.open}${lines.join("")}\n${" ".repeat(indent)}${doc.close}`
}

// ---------------------------------------------------------------------------
// Values to docs.
// ---------------------------------------------------------------------------

const BIG = new Set(["nat", "int", "nat64", "int64"])
const FIXED = new Set(["nat8", "nat16", "nat32", "int8", "int16", "int32"])

function valueDoc(schema: AnyFieldSchema, value: unknown, path: string): Doc {
  const node = resolve(schema)
  const fail = (expected: string): never => {
    throw new TypeError(`${path}: expected ${expected}, got ${describe(value)}`)
  }
  switch (node.kind) {
    case "primitive": {
      const p = node.primitive
      if (p === "null" || p === "reserved") return "null"
      if (p === "empty") return fail("no value (the type empty has none)")
      if (p === "bool")
        return typeof value === "boolean" ? String(value) : fail("a bool")
      if (p === "text")
        return typeof value === "string" ? candidString(value) : fail("text")
      if (p === "principal") {
        return typeof value === "string"
          ? `principal ${candidString(value)}`
          : fail("principal text")
      }
      if (BIG.has(p)) {
        return typeof value === "bigint"
          ? `${groupedInteger(value)} : ${p}`
          : fail(`a bigint (${p})`)
      }
      if (FIXED.has(p)) {
        return Number.isInteger(value)
          ? `${groupedInteger(value as number)} : ${p}`
          : fail(`an integer (${p})`)
      }
      // float32, float64
      return typeof value === "number"
        ? `${floatText(value)} : ${p}`
        : fail(`a number (${p})`)
    }
    case "blob":
      return isBytes(value) ? blobText(value) : fail("a Uint8Array (blob)")
    case "unit":
      return "record {}"
    case "opt": {
      if (value === null) return "null"
      const boxed = isBoxedOpt(node)
      if (boxed && !(isObject(value) && Object.hasOwn(value, "some"))) {
        return fail("null or { some } (a boxed opt)")
      }
      const inner = boxed ? ownValue(value as object, "some") : value
      const innerPath = boxed ? childPath(path, "some") : path
      const doc = valueDoc(node.inner, inner, innerPath)
      // `opt` takes a plain value: an annotated number goes in parentheses.
      return {
        parts: isAnnotated(node.inner) ? ["opt (", doc, ")"] : ["opt ", doc],
      }
    }
    case "vec": {
      if (!Array.isArray(value)) return fail("an array (vec)")
      return group(
        "vec {",
        value.map((item, i) => valueDoc(node.inner, item, childPath(path, i))),
        ";",
        "}"
      )
    }
    case "record": {
      if (!isObject(value)) return fail("an object (record)")
      const items = fieldsOf(node).map(([key, field]): Doc => {
        if (!Object.hasOwn(value, key)) {
          throw new TypeError(`${childPath(path, key)}: missing field`)
        }
        return {
          parts: [
            `${candidLabel(key)} = `,
            valueDoc(field, ownValue(value, key), childPath(path, key)),
          ],
        }
      })
      return group("record {", items, ";", "}")
    }
    case "tuple": {
      const elements = elementsOf(node)
      if (!Array.isArray(value) || value.length !== elements.length) {
        return fail(`an array of ${elements.length} (tuple)`)
      }
      return group(
        "record {",
        elements.map((element, i) =>
          valueDoc(element, value[i], childPath(path, i))
        ),
        ";",
        "}"
      )
    }
    case "variant": {
      const tag = isObject(value) ? ownValue(value, "tag") : undefined
      const arm = typeof tag === "string" ? armOf(node, tag) : undefined
      if (typeof tag !== "string" || arm === undefined)
        return fail("{ tag } with a tag of the variant")
      if (isTagOnly(arm))
        return group("variant {", [candidLabel(tag)], ";", "}")
      if (!Object.hasOwn(value as object, "value")) {
        throw new TypeError(
          `${childPath(path, "value")}: missing payload of ${tag}`
        )
      }
      const payload = valueDoc(
        arm,
        ownValue(value as object, "value"),
        childPath(path, "value")
      )
      return group(
        "variant {",
        [{ parts: [`${candidLabel(tag)} = `, payload] }],
        ";",
        "}"
      )
    }
    case "func": {
      const ref = isObject(value) ? value : undefined
      const id = ref === undefined ? undefined : ownValue(ref, "principal")
      const method = ref === undefined ? undefined : ownValue(ref, "method")
      if (typeof id !== "string" || typeof method !== "string") {
        return fail("{ principal, method } (a func reference)")
      }
      return `func ${candidString(id)}.${candidName(method)}`
    }
    case "service":
      return typeof value === "string"
        ? `service ${candidString(value)}`
        : fail("principal text (a service)")
  }
}

/** Whether a value of this schema prints with a `: type` annotation. */
function isAnnotated(schema: AnyFieldSchema): boolean {
  const node = resolve(schema)
  return (
    node.kind === "primitive" &&
    (BIG.has(node.primitive) ||
      FIXED.has(node.primitive) ||
      node.primitive.startsWith("float"))
  )
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null
}

function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return `an array of ${value.length}`
  if (isBytes(value)) return `${value.length} bytes`
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "string")
    return `the text ${JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value)}`
  return typeof value === "object"
    ? "an object"
    : `${typeof value} ${String(value)}`
}

// ---------------------------------------------------------------------------
// Leaves.
// ---------------------------------------------------------------------------

/** Underscore groups of three, as didc prints: `-1_234_567`. */
function groupedInteger(n: bigint | number): string {
  const text = n.toString()
  const negative = text.startsWith("-")
  const digits = negative ? text.slice(1) : text
  let out = ""
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += "_"
    out += digits[i]
  }
  return negative ? `-${out}` : out
}

function floatText(x: number): string {
  // Candid text has no literal for NaN or the infinities; these are what
  // didc prints for them, so the text at least says which one it is.
  if (Number.isNaN(x)) return "NaN"
  if (x === Infinity) return "inf"
  if (x === -Infinity) return "-inf"
  if (Object.is(x, -0)) return "-0.0"
  // JavaScript's shortest round-trip text; "1e+21" is a Candid float too. A
  // float32 value prints its exact double, which the annotation narrows back.
  const text = String(x)
  return /[.e]/.test(text) ? text : `${text}.0`
}

// Code points that would hide or reorder text: controls, bidi controls,
// zero-width and other invisible format characters, lone surrogates and tag
// characters. The confirm step shows this text before a write, so each is
// spelled as an escape.
const INVISIBLE: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xd800, 0xdfff],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff0, 0xfffb],
  [0xe0000, 0xe007f],
]

function isInvisible(cp: number): boolean {
  return INVISIBLE.some(([low, high]) => cp >= low && cp <= high)
}

/** Text as a Candid string literal, escaped. */
export function candidString(text: string): string {
  let out = '"'
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (ch === '"') out += '\\"'
    else if (ch === "\\") out += "\\\\"
    else if (ch === "\n") out += "\\n"
    else if (ch === "\r") out += "\\r"
    else if (ch === "\t") out += "\\t"
    else if (isInvisible(cp)) {
      out += `\\u{${cp.toString(16)}}`
    } else out += ch
  }
  return `${out}"`
}

/**
 * A blob as didc prints one: readable when every byte is printable ASCII
 * (tab, newline and return allowed), with `"`, `'`, `` ` `` and `\` escaped;
 * otherwise every byte as `\xx`.
 */
function blobText(bytes: Uint8Array): string {
  const readable = bytes.every(
    (b) => (b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d
  )
  let out = 'blob "'
  for (const b of bytes) {
    const plain =
      readable &&
      b >= 0x20 &&
      b <= 0x7e &&
      b !== 0x22 &&
      b !== 0x27 &&
      b !== 0x60 &&
      b !== 0x5c
    out += plain
      ? String.fromCharCode(b)
      : `\\${b.toString(16).padStart(2, "0")}`
  }
  return `${out}"`
}

// Words the Candid lexer reads as keywords (or booleans): never bare labels.
const KEYWORDS = new Set([
  "import",
  "service",
  "func",
  "type",
  "opt",
  "vec",
  "record",
  "variant",
  "blob",
  "principal",
  "nat",
  "nat8",
  "nat16",
  "nat32",
  "nat64",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "float32",
  "float64",
  "bool",
  "text",
  "null",
  "reserved",
  "empty",
  "oneway",
  "query",
  "composite_query",
  "true",
  "false",
])

const CANDID_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** A method or field name: bare when the lexer reads it as a name, else quoted. */
function candidName(name: string): string {
  return CANDID_IDENTIFIER.test(name) && !KEYWORDS.has(name)
    ? name
    : candidString(name)
}

/** A field or arm label: the numeric id of an unnamed label (`_7_` → 7), else the name. */
function candidLabel(key: string): string {
  const id = numericLabelId(key)
  return id === undefined ? candidName(key) : String(id)
}
