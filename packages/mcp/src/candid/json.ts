// Candid values as the JSON an AI model writes and reads, directed by the
// method's schemas:
//
//   bool, null, text      true, null, "text"
//   nat8..int32           a number (input also takes a decimal string)
//   nat, int, nat64, int64  a decimal string "150000000" (input also takes a
//                         safe-integer number)
//   float32, float64      a number, or "NaN", "Infinity", "-Infinity", "-0"
//   principal, service    principal text (input: trimmed, any case)
//   blob                  lower-case hex (input: hex, or { "utf8": text })
//   opt T                 null or T; { "some": T } when T itself admits null
//   vec T, tuple          an array
//   record, unit          an object of the fields (input: an opt field may be
//                         left out)
//   variant               { "tag": arm, "value": payload }, { "tag": arm } for
//                         a null payload (input: also just "arm")
//   func                  { "principal": text, "method": name }
//   reserved              null (input: anything)
//
// Input is lenient where that is unambiguous; output is one canonical form,
// and reading it back gives a value that encodes to the same bytes. Reading
// is bounded (INPUT_LIMITS) and every refusal names its `$`-rooted path.
import {
  isPrincipal,
  type AnyFieldSchema,
  type AnySchema,
} from "@meantjs/schema"
import { isResultSchema, validate } from "@meantjs/schema/validate"
import {
  BIG_RANGES,
  EXAMPLE_PRINCIPAL,
  FIXED_RANGES,
  FLOAT_WORDS,
  INPUT_LIMITS,
  closeName,
  got,
  loneSurrogateAt,
  nameList,
  quote,
} from "./formats.ts"
import { fromHex, toHex } from "./hex.ts"
import { inputShape } from "./json-schema.ts"
import {
  admitsNull,
  armOf,
  armsOf,
  childPath,
  elementsOf,
  fieldOf,
  fieldsOf,
  hasOwnEnumerable,
  isBytes,
  isPlainObject,
  isTagOnly,
  resolve,
  setOwn,
  type OptNode,
  type RecordNode,
  type TupleNode,
  type VariantNode,
} from "./schema-walk.ts"
import { typeText } from "./type-text.ts"

export {
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_NODES,
  inputShape,
  methodInput,
} from "./json-schema.ts"
export { INPUT_LIMITS } from "./formats.ts"
export {
  DEFAULT_SIGNATURE_CHARS,
  DEFAULT_TYPE_CHARS,
  signatureText,
  typeText,
  type TypeTextOptions,
} from "./type-text.ts"

/** A JSON value. */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json }

/** A JSON Schema object (the subset this module writes). */
export type JsonSchema = { [key: string]: unknown }

/** One problem with a tool's input, at a `$`-rooted path such as `$.to.owner`. */
export interface InputIssue {
  readonly path: string
  readonly message: string
}

/** How a method's arguments are laid out in a tool's input object. */
export type InputShape =
  /** No arguments: the input is `{}`. */
  | { readonly kind: "none" }
  /** One record argument: its fields are the input's properties. */
  | { readonly kind: "fields" }
  /** Anything else: `arg0`, `arg1`, … */
  | { readonly kind: "positional"; readonly count: number }

export interface MethodInput {
  readonly shape: InputShape
  /**
   * `{ type: "object", properties, required, additionalProperties: false }`;
   * an object cut to fit, or one with a field named `__proto__` (which ajv
   * skips), leaves out `additionalProperties`.
   */
  readonly schema: JsonSchema
  /** `false` when parts were cut to fit the budget; values are still checked in full. */
  readonly complete: boolean
}

export interface SchemaBudget {
  /** The most schema nodes written for one method (default 2000). */
  readonly maxNodes?: number
  /**
   * About the most characters of JSON written for one method (default
   * 64,000), names and descriptions included: a canister's long field names
   * cannot make a schema larger than this.
   */
  readonly maxChars?: number
}

export type ReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: InputIssue[] }

export type ArgsResult =
  | { readonly ok: true; readonly values: unknown[] }
  | { readonly ok: false; readonly issues: InputIssue[] }

/**
 * A method's argument values from a tool's input object, laid out as `shape`
 * (from `methodInput`) says. The values are checked with `validate` too, so
 * what comes back encodes; every issue names its path from the input's root
 * (`$.amount`, `$.arg1[0]`).
 *
 * @throws TypeError when `shape` is not the one `methodInput` gives `args`.
 */
export function argsFromInput(
  args: readonly AnyFieldSchema[],
  shape: InputShape,
  input: unknown
): ArgsResult {
  const expected = inputShape(args)
  if (
    expected.kind !== shape.kind ||
    (shape.kind === "positional" && shape.count !== args.length)
  ) {
    throw new TypeError(
      `the input shape "${shape.kind}" is not the shape of these ${args.length} arguments ("${expected.kind}")`
    )
  }
  const reader = new Reader()
  const read: { readonly path: string; value: unknown }[] = []
  reader.guard("$", () => {
    switch (shape.kind) {
      case "none":
        return reader.noArguments(input)
      case "fields":
        // The record is the input object itself; no arguments is no fields.
        read.push({
          path: "$",
          value: reader.read(args[0] as AnyFieldSchema, input ?? {}, "$", 0),
        })
        return
      case "positional":
        return reader.positional(args, input ?? {}, read)
    }
  })
  if (reader.issues.length > 0) return { ok: false, issues: reader.issues }
  const issues: InputIssue[] = []
  read.forEach(({ path, value }, i) => {
    issues.push(...validationIssues(args[i] as AnyFieldSchema, value, path))
  })
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, values: read.map(({ value }) => value) }
}

/**
 * The Candid value of one JSON value, as the conventions above read it, and
 * checked with `validate`. Issues are rooted at `path` (default `$`).
 */
export function valueFromJson(
  schema: AnyFieldSchema,
  json: unknown,
  path = "$"
): ReadResult {
  const reader = new Reader()
  let value: unknown
  reader.guard(path, () => {
    value = reader.read(schema, json, path, 0)
  })
  if (reader.issues.length > 0) return { ok: false, issues: reader.issues }
  const issues = validationIssues(schema, value, path)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value }
}

/**
 * A value as canonical JSON. Never throws: a value the schema does not
 * describe is written as best it can be (bigints as strings, bytes as hex).
 */
export function valueToJson(schema: AnyFieldSchema, value: unknown): Json {
  try {
    return toJson(schema, value, 0)
  } catch {
    // A broken schema, or a value whose getters throw: decoded values have
    // neither.
    try {
      return looseJson(value, 0)
    } catch {
      return null
    }
  }
}

/**
 * The ok and err payload schemas when `results` is one `Ok`/`Err` (or
 * `ok`/`err`) variant: the client resolves with the ok payload and rejects
 * with the err payload. Undefined for any other result list.
 */
export function resultArms(
  results: readonly AnyFieldSchema[]
): { readonly ok: AnyFieldSchema; readonly err: AnyFieldSchema } | undefined {
  const [only] = results
  if (results.length !== 1 || only === undefined || !isResultSchema(only)) {
    return undefined
  }
  const node = resolve(only)
  if (node.kind !== "variant") return undefined
  // isResultSchema accepts exactly Ok/Err or ok/err, never a mix.
  const ok = armOf(node, "Ok") ?? armOf(node, "ok")
  const err = armOf(node, "Err") ?? armOf(node, "err")
  return ok === undefined || err === undefined ? undefined : { ok, err }
}

// ---------------------------------------------------------------------------
// Reading.
// ---------------------------------------------------------------------------

// What a read returns for a value it refused; the issue is already recorded.
const INVALID = Symbol("invalid")

const SIGNED_DECIMAL = /^-?[0-9]+$/

class Reader {
  readonly issues: InputIssue[] = []
  private values = 0
  private halted = false

  /** Records an issue; returns INVALID for the caller to return. */
  issue(path: string, message: string): typeof INVALID {
    if (!this.halted) {
      this.issues.push({ path, message })
      if (this.issues.length >= INPUT_LIMITS.maxIssues) this.halted = true
    }
    return INVALID
  }

  /** Runs a read, turning a broken schema's exception into an issue. */
  guard(path: string, run: () => void): void {
    try {
      run()
    } catch (error) {
      this.halted = false
      this.issue(
        path,
        `the method's Candid type could not be read: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /** One JSON value: charged against the bounds, then read. */
  read(
    schema: AnyFieldSchema,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    if (this.halted) return INVALID
    if (depth > INPUT_LIMITS.maxDepth) {
      this.issue(
        path,
        `the input is nested deeper than ${INPUT_LIMITS.maxDepth} levels here`
      )
      this.halted = true
      return INVALID
    }
    this.values++
    if (this.values > INPUT_LIMITS.maxValues) {
      this.issue(
        path,
        `the input holds more than ${INPUT_LIMITS.maxValues} values; send less in one call`
      )
      this.halted = true
      return INVALID
    }
    return this.node(schema, json, path, depth)
  }

  noArguments(input: unknown): void {
    if (input === undefined || input === null) return
    if (!isPlainObject(input)) {
      this.issue(
        "$",
        `expected {}: this method takes no arguments, got ${got(input)}`
      )
      return
    }
    for (const key of Object.keys(input)) {
      this.issue(
        childPath("$", key),
        "unknown key: this method takes no arguments"
      )
    }
  }

  positional(
    args: readonly AnyFieldSchema[],
    input: unknown,
    out: { readonly path: string; value: unknown }[]
  ): void {
    if (!isPlainObject(input)) {
      this.issue(
        "$",
        `expected an object with the arguments arg0 to arg${args.length - 1}, got ${got(input)}`
      )
      return
    }
    const keys = args.map((_, i) => `arg${i}`)
    args.forEach((arg, i) => {
      const key = keys[i] as string
      const path = childPath("$", key)
      if (!isPresent(input, key)) {
        if (resolve(arg).kind === "opt") out.push({ path, value: null })
        else
          this.issue(
            path,
            `missing argument (${typeText(arg, { maxChars: 80 })})`
          )
        return
      }
      out.push({ path, value: this.read(arg, input[key], path, 1) })
    })
    for (const key of Object.keys(input)) {
      if (!keys.includes(key)) {
        this.issue(childPath("$", key), unknownKey(key, keys, "arguments"))
      }
    }
  }

  private node(
    schema: AnyFieldSchema,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    const node = resolve(schema)
    switch (node.kind) {
      case "primitive":
        return this.primitive(node.primitive, json, path)
      case "blob":
        return this.blob(json, path)
      case "unit":
        return this.unit(json, path)
      case "opt":
        return this.opt(node, json, path, depth)
      case "vec":
        return this.vec(node.inner, json, path, depth)
      case "record":
        return this.record(node, json, path, depth)
      case "tuple":
        return this.tuple(node, json, path, depth)
      case "variant":
        return this.variant(node, json, path, depth)
      case "func":
        return this.func(json, path)
      case "service":
        return this.principal(json, path, "a service reference")
    }
  }

  private primitive(p: string, json: unknown, path: string): unknown {
    if (FIXED_RANGES[p] !== undefined) return this.fixed(p, json, path)
    if (BIG_RANGES[p] !== undefined) return this.big(p, json, path)
    switch (p) {
      case "bool":
        return typeof json === "boolean"
          ? json
          : this.issue(path, `expected true or false (bool), got ${got(json)}`)
      case "null":
        return json === null
          ? null
          : this.issue(path, `expected null, got ${got(json)}`)
      case "reserved":
        // Every value inhabits reserved, and it is sent as null.
        return null
      case "empty":
        return this.issue(
          path,
          "nothing can be sent here: the type is empty, which has no values"
        )
      case "text":
        return typeof json === "string"
          ? this.text(json, path)
          : this.issue(path, `expected a string (text), got ${got(json)}`)
      case "float32":
      case "float64":
        return this.float(p, json, path)
      case "principal":
        return this.principal(json, path, "a principal")
      default:
        return this.issue(path, `unsupported Candid type ${p}`)
    }
  }

  private text(text: string, path: string): unknown {
    const at = loneSurrogateAt(text)
    if (at === -1) return text
    const unit = text.charCodeAt(at).toString(16)
    return this.issue(
      path,
      `the text has a lone surrogate (\\u${unit} at index ${at}); Candid text is Unicode characters only`
    )
  }

  private fixed(p: string, json: unknown, path: string): unknown {
    const [min, max] = FIXED_RANGES[p] as readonly [number, number]
    const range = `${p} is an integer from ${min} to ${max}`
    let value: number
    if (typeof json === "number") {
      if (!Number.isInteger(json))
        return this.issue(path, `${range}, got ${json}`)
      value = json
    } else if (
      typeof json === "string" &&
      SIGNED_DECIMAL.test(json.trim()) &&
      json.trim().length <= 40
    ) {
      const big = BigInt(json.trim())
      if (big < BigInt(min) || big > BigInt(max)) {
        return this.issue(path, `${range}, got ${big}`)
      }
      value = Number(big)
    } else {
      return this.issue(
        path,
        `expected ${p}, an integer from ${min} to ${max}, got ${got(json)}`
      )
    }
    if (value < min || value > max)
      return this.issue(path, `${range}, got ${value}`)
    return value === 0 ? 0 : value // -0 is 0
  }

  private big(p: string, json: unknown, path: string): unknown {
    const range = BIG_RANGES[p] as (typeof BIG_RANGES)[string]
    let value: bigint
    if (typeof json === "number") {
      if (!Number.isInteger(json)) {
        return this.issue(path, `${p} is an integer, got ${json}`)
      }
      if (!Number.isSafeInteger(json)) {
        return this.issue(
          path,
          `${p} needs the exact digits as a decimal string: a JSON number this large (past 2^53) has already lost digits, so write the value in quotes`
        )
      }
      value = BigInt(json)
    } else if (typeof json === "string" && SIGNED_DECIMAL.test(json.trim())) {
      const digits = json.trim()
      if (digits.length > INPUT_LIMITS.maxDigits) {
        return this.issue(
          path,
          `this number has more than ${INPUT_LIMITS.maxDigits} digits`
        )
      }
      value = BigInt(digits)
    } else {
      return this.issue(
        path,
        `expected ${p} as a decimal string (${range.text}), such as "150000000", got ${got(json)}`
      )
    }
    if (
      (range.min !== undefined && value < range.min) ||
      (range.max !== undefined && value > range.max)
    ) {
      return this.issue(path, `${p} is ${range.text}, got ${value}`)
    }
    return value
  }

  private float(p: string, json: unknown, path: string): unknown {
    let value: number
    if (typeof json === "number") {
      value = json
    } else if (
      typeof json === "string" &&
      (FLOAT_WORDS as readonly string[]).includes(json.trim())
    ) {
      value = Number(json.trim()) // "NaN", "Infinity", "-Infinity", "-0"
    } else {
      return this.issue(
        path,
        `expected ${p} as a JSON number (or "NaN", "Infinity", "-Infinity", "-0"), got ${got(json)}`
      )
    }
    if (
      p === "float32" &&
      !Number.isNaN(value) &&
      Math.fround(value) !== value
    ) {
      const nearest = Math.fround(value)
      return this.issue(
        path,
        Number.isFinite(nearest)
          ? `float32 cannot hold ${value} exactly; the nearest float32 value is ${nearest}`
          : `${value} is past the range of float32 (±3.4028234663852886e+38)`
      )
    }
    return value
  }

  private principal(json: unknown, path: string, what: string): unknown {
    if (typeof json !== "string") {
      return this.issue(
        path,
        `expected ${what} as principal text such as "${EXAMPLE_PRINCIPAL}", got ${got(json)}`
      )
    }
    const text = json.trim().toLowerCase()
    if (isPrincipal(text)) return text
    return this.issue(path, principalProblem(json.trim(), what))
  }

  private blob(json: unknown, path: string): unknown {
    if (typeof json === "string") {
      const bytes = fromHex(json)
      return (
        bytes ??
        this.issue(
          path,
          `expected a blob as hex (an even number of hex digits, such as "00ff") or as { "utf8": text }, got ${got(json)}`
        )
      )
    }
    if (!isPlainObject(json) || !hasOwnEnumerable(json, "utf8")) {
      return this.issue(
        path,
        `expected a blob as hex such as "00ff", or as { "utf8": text }, got ${got(json)}`
      )
    }
    let ok = true
    for (const key of Object.keys(json)) {
      if (key !== "utf8") {
        ok = false
        this.issue(
          childPath(path, key),
          'unknown key: a blob written as text is exactly { "utf8": text }'
        )
      }
    }
    const text = json.utf8
    if (typeof text !== "string") {
      return this.issue(
        childPath(path, "utf8"),
        `expected a string, got ${got(text)}`
      )
    }
    if (this.text(text, childPath(path, "utf8")) === INVALID || !ok)
      return INVALID
    return new TextEncoder().encode(text)
  }

  private unit(json: unknown, path: string): unknown {
    if (!isPlainObject(json)) {
      return this.issue(
        path,
        `expected {} (the empty record), got ${got(json)}`
      )
    }
    const keys = Object.keys(json)
    for (const key of keys) {
      this.issue(
        childPath(path, key),
        "unknown key: this is the empty record, written {}"
      )
    }
    return keys.length === 0 ? {} : INVALID
  }

  private opt(
    node: OptNode,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    if (json === null) return null
    const inner = resolve(node.inner)
    if (admitsNull(inner)) {
      // The value can itself be null, so a present one is boxed: { some }.
      if (!isPlainObject(json) || !hasOwnEnumerable(json, "some")) {
        return this.issue(
          path,
          `expected null or { "some": … }: this opt's value can itself be null, so a present value is boxed, got ${got(json)}`
        )
      }
      let ok = true
      for (const key of Object.keys(json)) {
        if (key !== "some") {
          ok = false
          this.issue(
            childPath(path, key),
            'unknown key: a present value is exactly { "some": value }'
          )
        }
      }
      const value = this.read(
        node.inner,
        json.some,
        childPath(path, "some"),
        depth + 1
      )
      return ok && value !== INVALID ? { some: value } : INVALID
    }
    if (
      isPlainObject(json) &&
      Object.keys(json).length === 1 &&
      hasOwnEnumerable(json, "some") &&
      !(inner.kind === "record" && fieldOf(inner, "some") !== undefined)
    ) {
      return this.issue(
        path,
        'write the value itself (or null for none), without { "some": … }: this opt is not boxed'
      )
    }
    // The value itself, at the same level of the JSON.
    return this.node(node.inner, json, path, depth)
  }

  private vec(
    inner: AnyFieldSchema,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    if (!Array.isArray(json)) {
      return this.issue(
        path,
        `expected an array (vec ${typeText(inner, { maxChars: 80 })}), got ${got(json)}`
      )
    }
    if (json.length > INPUT_LIMITS.maxVecLength) {
      return this.issue(
        path,
        `a vec here holds at most ${INPUT_LIMITS.maxVecLength} elements, got ${json.length}`
      )
    }
    const out: unknown[] = []
    let ok = true
    for (let i = 0; i < json.length && !this.halted; i++) {
      const value = this.read(inner, json[i], childPath(path, i), depth + 1)
      if (value === INVALID) ok = false
      out.push(value)
    }
    return ok && !this.halted ? out : INVALID
  }

  private record(
    node: RecordNode,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    const fields = fieldsOf(node)
    if (!isPlainObject(json)) {
      return this.issue(
        path,
        `expected an object with the fields ${nameList(fields.map(([key]) => key))}, got ${got(json)}`
      )
    }
    const out: Record<string, unknown> = {}
    let ok = true
    for (const [key, field] of fields) {
      if (this.halted) return INVALID
      const at = childPath(path, key)
      if (!isPresent(json, key)) {
        // An opt field left out is null.
        if (resolve(field).kind === "opt") {
          setOwn(out, key, null)
        } else {
          ok = false
          this.issue(at, `missing field (${typeText(field, { maxChars: 80 })})`)
        }
        continue
      }
      const value = this.read(field, json[key], at, depth + 1)
      if (value === INVALID) ok = false
      else setOwn(out, key, value)
    }
    const keys = fields.map(([key]) => key)
    for (const key of Object.keys(json)) {
      if (this.halted) return INVALID
      if (fieldOf(node, key) === undefined) {
        ok = false
        this.issue(childPath(path, key), unknownKey(key, keys, "fields"))
      }
    }
    return ok ? out : INVALID
  }

  private tuple(
    node: TupleNode,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    const elements = elementsOf(node)
    if (!Array.isArray(json) || json.length !== elements.length) {
      return this.issue(
        path,
        `expected an array of exactly ${elements.length} values (a tuple), got ${got(json)}`
      )
    }
    const out: unknown[] = []
    let ok = true
    elements.forEach((element, i) => {
      const value = this.read(element, json[i], childPath(path, i), depth + 1)
      if (value === INVALID) ok = false
      out.push(value)
    })
    return ok && !this.halted ? out : INVALID
  }

  private variant(
    node: VariantNode,
    json: unknown,
    path: string,
    depth: number
  ): unknown {
    const tags = armsOf(node).map(([tag]) => tag)
    if (typeof json === "string") {
      // Just the tag, for an arm without a payload.
      const arm = armOf(node, json)
      if (arm === undefined) return this.issue(path, unknownTag(json, tags))
      if (!isTagOnly(arm)) {
        return this.issue(
          path,
          `the arm ${quote(json)} carries a value: write { "tag": ${quote(json)}, "value": … }`
        )
      }
      return { tag: json }
    }
    if (!isPlainObject(json)) {
      return this.issue(
        path,
        `expected a variant, { "tag": arm, "value": payload }, got ${got(json)}`
      )
    }
    if (!hasOwnEnumerable(json, "tag")) {
      const [only, ...others] = Object.keys(json)
      if (
        only !== undefined &&
        others.length === 0 &&
        only !== "value" &&
        armOf(node, only) !== undefined
      ) {
        return this.issue(
          path,
          `write { "tag": ${quote(only)}, "value": … }, not { ${quote(only)}: … }`
        )
      }
      return this.issue(
        childPath(path, "tag"),
        `missing tag: a variant is { "tag": arm, "value": payload }, the arms being ${nameList(tags)}`
      )
    }
    const tag = json.tag
    if (typeof tag !== "string") {
      return this.issue(
        childPath(path, "tag"),
        `expected the arm's name as a string, got ${got(tag)}`
      )
    }
    const arm = armOf(node, tag)
    if (arm === undefined)
      return this.issue(childPath(path, "tag"), unknownTag(tag, tags))
    let ok = true
    for (const key of Object.keys(json)) {
      if (key !== "tag" && key !== "value") {
        ok = false
        this.issue(
          childPath(path, key),
          'unknown key: a variant is { "tag": arm, "value": payload }'
        )
      }
    }
    if (isTagOnly(arm)) {
      if (isPresent(json, "value") && json.value !== null) {
        ok = false
        this.issue(
          childPath(path, "value"),
          `the arm ${quote(tag)} carries no value: leave "value" out`
        )
      }
      return ok ? { tag } : INVALID
    }
    if (!isPresent(json, "value")) {
      return this.issue(
        childPath(path, "value"),
        `missing value: the arm ${quote(tag)} carries ${typeText(arm, { maxChars: 80 })}`
      )
    }
    const value = this.read(
      arm,
      json.value,
      childPath(path, "value"),
      depth + 1
    )
    return ok && value !== INVALID ? { tag, value } : INVALID
  }

  private func(json: unknown, path: string): unknown {
    if (!isPlainObject(json)) {
      return this.issue(
        path,
        `expected a func reference, { "principal": text, "method": name }, got ${got(json)}`
      )
    }
    let principal: unknown = INVALID
    if (isPresent(json, "principal")) {
      principal = this.principal(
        json.principal,
        childPath(path, "principal"),
        "the func's canister"
      )
    } else {
      this.issue(
        childPath(path, "principal"),
        "missing the canister's principal"
      )
    }
    const method = json.method
    const methodPath = childPath(path, "method")
    let ok = false
    if (!isPresent(json, "method")) {
      this.issue(methodPath, "missing the method's name")
    } else if (typeof method !== "string" || method.length === 0) {
      this.issue(
        methodPath,
        `expected the method's name as a non-empty string, got ${got(method)}`
      )
    } else {
      ok = this.text(method, methodPath) !== INVALID
    }
    for (const key of Object.keys(json)) {
      if (key !== "principal" && key !== "method") {
        ok = false
        this.issue(
          childPath(path, key),
          'unknown key: a func reference is { "principal", "method" }'
        )
      }
    }
    return ok && principal !== INVALID ? { principal, method } : INVALID
  }
}

/** Present in the input: an own enumerable key whose value is not undefined. */
function isPresent(json: Record<string, unknown>, key: string): boolean {
  return hasOwnEnumerable(json, key) && json[key] !== undefined
}

function unknownKey(
  key: string,
  keys: readonly string[],
  noun: string
): string {
  const close = closeName(key, keys)
  const hint = close === undefined ? "" : ` (did you mean ${quote(close)}?)`
  return keys.length === 0
    ? `unknown key${hint}`
    : `unknown key${hint}; the ${noun} are ${nameList(keys)}`
}

function unknownTag(tag: string, tags: readonly string[]): string {
  const close = closeName(tag, tags)
  const hint = close === undefined ? "" : ` (did you mean ${quote(close)}?)`
  return `unknown arm ${quote(tag)}${hint}; the arms are ${nameList(tags)}`
}

function principalProblem(text: string, what: string): string {
  if (/^(0x)?[0-9a-f]{64}$/i.test(text)) {
    return `${quote(text)} looks like an account identifier (64 hex digits), not ${what}: write principal text such as "${EXAMPLE_PRINCIPAL}"`
  }
  if (!/^[a-z2-7-]+$/i.test(text)) {
    return `${quote(text)} is not principal text, which has only the letters a-z, the digits 2-7 and dashes, such as "${EXAMPLE_PRINCIPAL}"`
  }
  return `${quote(text)} is not a valid principal: its grouping or checksum is wrong (a typo?)`
}

/** validate()'s issues, their paths moved under the value's own path. */
function validationIssues(
  schema: AnyFieldSchema,
  value: unknown,
  path: string
): InputIssue[] {
  const result = validate(schema as AnySchema, value)
  if (result.ok) return []
  return result.issues.map((issue) => ({
    path: `${path}${issue.path.slice(1)}`,
    message: issue.message,
  }))
}

// ---------------------------------------------------------------------------
// Writing.
// ---------------------------------------------------------------------------

// Past this depth a value is written loosely; a decoded reply is at most 256
// levels deep under the codec's default limits.
const MAX_WRITE_DEPTH = 512

function toJson(schema: AnyFieldSchema, value: unknown, depth: number): Json {
  if (depth > MAX_WRITE_DEPTH) return looseJson(value, depth)
  const node = resolve(schema)
  switch (node.kind) {
    case "primitive":
      return primitiveJson(node.primitive, value, depth)
    case "blob":
      return isBytes(value) ? toHex(value) : looseJson(value, depth)
    case "unit":
      return {}
    case "opt": {
      if (value === null || value === undefined) return null
      if (!admitsNull(resolve(node.inner)))
        return toJson(node.inner, value, depth + 1)
      if (!isPlainObject(value) || !Object.hasOwn(value, "some"))
        return looseJson(value, depth)
      return { some: toJson(node.inner, value.some, depth + 1) }
    }
    case "vec":
      return Array.isArray(value)
        ? value.map((item: unknown) => toJson(node.inner, item, depth + 1))
        : looseJson(value, depth)
    case "record": {
      if (!isPlainObject(value)) return looseJson(value, depth)
      const out: { [key: string]: Json } = {}
      for (const [key, field] of fieldsOf(node)) {
        if (Object.hasOwn(value, key))
          setOwn(out, key, toJson(field, value[key], depth + 1))
      }
      return out
    }
    case "tuple": {
      const elements = elementsOf(node)
      if (!Array.isArray(value)) return looseJson(value, depth)
      return value.map((item: unknown, i) => {
        const element = elements[i]
        return element === undefined
          ? looseJson(item, depth + 1)
          : toJson(element, item, depth + 1)
      })
    }
    case "variant": {
      const tag = isPlainObject(value) ? value.tag : undefined
      const arm = typeof tag === "string" ? armOf(node, tag) : undefined
      if (
        typeof tag !== "string" ||
        arm === undefined ||
        !isPlainObject(value)
      ) {
        return looseJson(value, depth)
      }
      if (isTagOnly(arm)) return { tag }
      return { tag, value: toJson(arm, value.value, depth + 1) }
    }
    case "func": {
      if (!isPlainObject(value)) return looseJson(value, depth)
      return {
        principal: looseJson(value.principal, depth + 1),
        method: looseJson(value.method, depth + 1),
      }
    }
    case "service":
      return looseJson(value, depth)
  }
}

function primitiveJson(p: string, value: unknown, depth: number): Json {
  switch (p) {
    case "null":
    case "reserved":
    case "empty":
      return null
    case "float32":
    case "float64":
      return typeof value === "number"
        ? floatJson(value)
        : looseJson(value, depth)
  }
  if (
    FIXED_RANGES[p] !== undefined &&
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value === 0 ? 0 : value // -0 is 0
  }
  // bool, text, principal, and nat, int, nat64, int64, whose bigint becomes
  // its decimal string: the rest are JSON already.
  return looseJson(value, depth)
}

/** A float as JSON: a number, or the word for one JSON has no number for. */
function floatJson(x: number): Json {
  if (Number.isNaN(x)) return "NaN"
  if (x === Infinity) return "Infinity"
  if (x === -Infinity) return "-Infinity"
  if (Object.is(x, -0)) return "-0"
  return x
}

/** Any value as JSON, without a schema: what is written when nothing fits. */
function looseJson(value: unknown, depth: number): Json {
  if (depth > MAX_WRITE_DEPTH) return "[nested too deep to show]"
  if (value === null || value === undefined) return null
  switch (typeof value) {
    case "boolean":
    case "string":
      return value
    case "number":
      return floatJson(value)
    case "bigint":
      return value.toString()
    case "object": {
      if (isBytes(value)) return toHex(value)
      if (Array.isArray(value))
        return value.map((item: unknown) => looseJson(item, depth + 1))
      const out: { [key: string]: Json } = {}
      for (const key of Object.keys(value)) {
        setOwn(
          out,
          key,
          looseJson((value as Record<string, unknown>)[key], depth + 1)
        )
      }
      return out
    }
    default:
      return null
  }
}
