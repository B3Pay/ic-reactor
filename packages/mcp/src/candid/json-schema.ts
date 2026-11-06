// JSON Schemas for a method's tool input: plain draft 2020-12, in the subset
// LLM tool APIs accept (no $ref or $defs). Each leaf says its Candid type and
// format in `description`; the reader in json.ts accepts what these describe,
// and a little more where that is unambiguous.
import type { AnyFieldSchema } from "@meantjs/schema"
import {
  EXAMPLE_PRINCIPAL,
  INPUT_LIMITS,
  leafSchema,
  nameList,
} from "./formats.ts"
import type {
  InputShape,
  JsonSchema,
  MethodInput,
  SchemaBudget,
} from "./json.ts"
import {
  admitsNull,
  armsOf,
  childPath,
  elementsOf,
  fieldsOf,
  isEmptyType,
  isTagOnly,
  resolve,
  setOwn,
} from "./schema-walk.ts"
import { typeText } from "./type-text.ts"

/** `maxNodes` when the budget gives none. */
export const DEFAULT_MAX_NODES = 2000

const SEE_DESCRIBE = "the describe tool shows the method's Candid"

/**
 * How a method's arguments are laid out in its tool input: none, the fields
 * of its one record argument, or `arg0`, `arg1`, …
 */
export function inputShape(args: readonly AnyFieldSchema[]): InputShape {
  const [only] = args
  if (only === undefined) return { kind: "none" }
  if (args.length === 1) {
    const node = resolve(only)
    if (node.kind === "record" && fieldsOf(node).length > 0) {
      return { kind: "fields" }
    }
  }
  return { kind: "positional", count: args.length }
}

/**
 * A method's tool input: its shape and the JSON Schema of the input object.
 * Parts past the budget are written `{}` with a description saying so, and
 * `complete` is then false; `argsFromInput` still checks values in full.
 */
export function methodInput(
  args: readonly AnyFieldSchema[],
  budget?: SchemaBudget
): MethodInput {
  const maxNodes = budget?.maxNodes ?? DEFAULT_MAX_NODES
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) {
    throw new TypeError(`maxNodes must be a positive integer, got ${maxNodes}`)
  }
  const shape = inputShape(args)
  const writer = new SchemaWriter(maxNodes)
  let schema: JsonSchema
  switch (shape.kind) {
    case "none":
      schema = { type: "object", properties: {}, additionalProperties: false }
      break
    case "fields":
      // The record is the input object itself: its fields are at `$.name`.
      schema = writer.write(args[0] as AnyFieldSchema, "$", 0)
      break
    case "positional":
      schema = writer.object(
        args.map((arg, i) => [`arg${i}`, arg] as const),
        "$",
        0,
        "arguments"
      )
      break
  }
  return { shape, schema, complete: writer.complete }
}

class SchemaWriter {
  complete = true
  private nodes = 0
  // Composite nodes being written, each with the path where it began: a node
  // met again below itself is recursion.
  private readonly active = new Map<object, string>()
  private readonly typeTexts = new Map<object, string>()

  constructor(private readonly maxNodes: number) {}

  private get spent(): boolean {
    return this.nodes >= this.maxNodes
  }

  /** The schema of a value of `schema` at `path`, `depth` levels below the input. */
  write(schema: AnyFieldSchema, path: string, depth: number): JsonSchema {
    if (depth > INPUT_LIMITS.maxDepth) {
      this.complete = false
      return {
        description: `nested deeper than the ${INPUT_LIMITS.maxDepth} levels a tool input may have`,
      }
    }
    if (this.spent) {
      this.complete = false
      return {
        description: `${this.typeOf(schema)}: cut to fit; ${SEE_DESCRIBE}`,
      }
    }
    this.nodes++
    const node = resolve(schema)
    switch (node.kind) {
      case "primitive":
        return leafSchema(node.primitive)
      case "blob":
        return blobSchema()
      case "unit":
        return {
          type: "object",
          properties: {},
          additionalProperties: false,
          description: "record {}: the empty record, written {}",
        }
      case "func":
        return {
          type: "object",
          properties: {
            principal: {
              type: "string",
              description: `the canister's principal, as text such as ${EXAMPLE_PRINCIPAL}`,
            },
            method: { type: "string", description: "the method's name" },
          },
          required: ["principal", "method"],
          additionalProperties: false,
          description: `a func reference: a method of type ${this.typeOf(schema)}`,
        }
      case "service":
        return {
          type: "string",
          description: `a service reference: the canister's principal, as text such as ${EXAMPLE_PRINCIPAL}`,
        }
    }
    const enclosing = this.active.get(node)
    if (enclosing !== undefined) {
      return {
        description: `recursive: a value of the same type as ${enclosing}, ${this.typeOf(schema)}`,
      }
    }
    this.active.set(node, path)
    try {
      switch (node.kind) {
        case "opt": {
          if (!admitsNull(resolve(node.inner))) {
            // The value itself or null, at the same level of the JSON.
            return {
              anyOf: [this.write(node.inner, path, depth), { type: "null" }],
            }
          }
          const inner = this.write(
            node.inner,
            childPath(path, "some"),
            depth + 1
          )
          return {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                properties: { some: inner },
                required: ["some"],
                additionalProperties: false,
              },
            ],
            description:
              'opt whose value can itself be null: null for none, { "some": value } for a value',
          }
        }
        case "vec":
          return {
            type: "array",
            items: this.write(node.inner, `${path}[*]`, depth + 1),
          }
        case "record":
          return this.object(fieldsOf(node), path, depth, "fields")
        case "tuple": {
          const elements = elementsOf(node)
          const prefixItems: JsonSchema[] = []
          for (const [i, element] of elements.entries()) {
            if (this.spent) break
            prefixItems.push(this.write(element, childPath(path, i), depth + 1))
          }
          const out: JsonSchema = {
            type: "array",
            minItems: elements.length,
            maxItems: elements.length,
          }
          // 2020-12 wants prefixItems non-empty; the length still binds.
          if (prefixItems.length > 0) out.prefixItems = prefixItems
          if (elements.length === 0) {
            out.description = "an empty tuple, written []"
          } else if (prefixItems.length === elements.length) {
            out.description = `a tuple: an array of exactly ${elements.length} values in order`
          } else {
            // The elements past the cut are left out, not written `{}`: a
            // wide tuple stays as small as the budget.
            this.complete = false
            out.description = `a tuple of ${elements.length} values in order, the first ${prefixItems.length} shown (cut to fit); ${SEE_DESCRIBE}`
          }
          return out
        }
        case "variant":
          return this.variant(armsOf(node), path, depth)
      }
    } finally {
      this.active.delete(node)
    }
  }

  /**
   * An object of the given properties: a record's fields, or the arguments.
   * Opt properties are not required. Past the budget the rest are left out,
   * named in the description, and the object then admits other properties.
   */
  object(
    entries: readonly (readonly [string, AnyFieldSchema])[],
    path: string,
    depth: number,
    noun: string
  ): JsonSchema {
    const properties: Record<string, JsonSchema> = {}
    const required: string[] = []
    let written = 0
    for (const [key, schema] of entries) {
      if (this.spent) break
      setOwn(
        properties,
        key,
        this.write(schema, childPath(path, key), depth + 1)
      )
      if (resolve(schema).kind !== "opt") required.push(key)
      written++
    }
    const out: JsonSchema = { type: "object", properties }
    if (required.length > 0) out.required = required
    if (written === entries.length) {
      // ajv, which the MCP SDK validates with, skips a property named
      // __proto__ and would count it as additional; the reader still
      // refuses unknown keys.
      if (!Object.hasOwn(properties, "__proto__")) {
        out.additionalProperties = false
      }
    } else {
      this.complete = false
      const rest = entries.slice(written).map(([key]) => key)
      out.description = `${rest.length} more ${noun} not shown (cut to fit): ${nameList(rest)}; ${SEE_DESCRIBE}`
    }
    return out
  }

  /**
   * One object per arm, `tag` a const. An arm whose payload is `empty` has no
   * value to send and is left out. Past the budget the rest share one branch.
   */
  private variant(
    entries: readonly (readonly [string, AnyFieldSchema])[],
    path: string,
    depth: number
  ): JsonSchema {
    const arms = entries.filter(([, arm]) => !isEmptyType(arm))
    if (arms.length === 0) {
      return {
        description:
          "a variant with no arm that has a value: nothing can be sent",
      }
    }
    const branches: JsonSchema[] = []
    for (const [tag, arm] of arms) {
      if (this.spent) break
      this.nodes++
      const tagSchema = { type: "string", const: tag }
      branches.push(
        isTagOnly(arm)
          ? {
              type: "object",
              properties: { tag: tagSchema },
              required: ["tag"],
              additionalProperties: false,
            }
          : {
              type: "object",
              properties: {
                tag: tagSchema,
                value: this.write(arm, childPath(path, "value"), depth + 1),
              },
              required: ["tag", "value"],
              additionalProperties: false,
            }
      )
    }
    if (branches.length === arms.length) return { oneOf: branches }
    this.complete = false
    const rest = arms.slice(branches.length).map(([tag]) => tag)
    branches.push({
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
      description: `one of the ${rest.length} arms not shown (cut to fit): ${nameList(rest)}; ${SEE_DESCRIBE}`,
    })
    return { anyOf: branches }
  }

  private typeOf(schema: AnyFieldSchema): string {
    const node = resolve(schema)
    let text = this.typeTexts.get(node)
    if (text === undefined) {
      text = typeText(schema, { maxChars: 120 })
      this.typeTexts.set(node, text)
    }
    return text
  }
}

function blobSchema(): JsonSchema {
  return {
    anyOf: [
      { type: "string", pattern: "^([0-9a-fA-F]{2})*$" },
      {
        type: "object",
        properties: { utf8: { type: "string" } },
        required: ["utf8"],
        additionalProperties: false,
      },
    ],
    description:
      'blob (bytes): hex such as "00ff" ("" for none), or { "utf8": text } for the UTF-8 bytes of a text',
  }
}
