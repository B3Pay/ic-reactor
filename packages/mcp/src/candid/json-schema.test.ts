import { c, principal, type AnyFieldSchema, type Schema } from "@meantjs/schema"
import type { JsonSchemaType } from "@modelcontextprotocol/server"
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv"
import { describe, expect, it } from "vitest"
import { DEFAULT_MAX_NODES, inputShape, methodInput } from "./json-schema.ts"
import { valueToJson, type JsonSchema, type MethodInput } from "./json.ts"

const LEDGER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")

const Account = c.rec(() =>
  c.record({ owner: c.principal, subaccount: c.opt(c.blob()) })
)
const TransferArg = c.rec(() =>
  c.record({
    to: Account,
    fee: c.opt(c.nat),
    memo: c.opt(c.blob()),
    from_subaccount: c.opt(c.blob()),
    created_at_time: c.opt(c.nat64),
    amount: c.nat,
  })
)

type List = { head: bigint; tail: List | null }
const List: Schema<List> = c.rec(() =>
  c.record({ head: c.nat, tail: c.opt(List) })
)

type Tree = { tag: "leaf"; value: bigint } | { tag: "node"; value: Tree[] }
const Tree: Schema<Tree> = c.rec(() =>
  c.variant({ leaf: c.nat, node: c.vec(Tree) })
)

const NAT = {
  type: "string",
  pattern: "^[0-9]+$",
  description: "nat, as a decimal string (0 or more)",
}
const NAT8 = { type: "integer", description: "nat8, an integer from 0 to 255" }
const TEXT = { type: "string", description: "text" }
const PRINCIPAL = {
  type: "string",
  description: "principal, as text such as ryjl3-tyaaa-aaaaa-aaaba-cai",
}
const BLOB = {
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
const CUT = "the describe tool shows the method's Candid"

// The validator the MCP SDK uses: draft 2020-12, and its meta-schema.
const ajv = new AjvJsonSchemaValidator()
const metaSchema = ajv.getValidator<unknown>({
  $ref: "https://json-schema.org/draft/2020-12/schema",
})

// What LLM tool APIs accept: no $ref, $defs, $schema, or anything else.
const KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "anyOf",
  "oneOf",
  "const",
  "enum",
  "pattern",
  "description",
])

/** Every keyword a schema uses, property names aside. */
function keywordsOf(schema: unknown, into = new Set<string>()): Set<string> {
  if (typeof schema !== "object" || schema === null) return into
  for (const [key, value] of Object.entries(schema)) {
    into.add(key)
    if (key === "properties") {
      for (const property of Object.values(value as object)) {
        keywordsOf(property, into)
      }
    } else if (key === "items") {
      keywordsOf(value, into)
    } else if (key === "prefixItems" || key === "anyOf" || key === "oneOf") {
      for (const branch of value as unknown[]) keywordsOf(branch, into)
    }
  }
  return into
}

/** methodInput, its schema checked: valid 2020-12, in the accepted subset. */
function inputOf(args: AnyFieldSchema[], maxNodes?: number): MethodInput {
  const input = methodInput(
    args,
    maxNodes === undefined ? undefined : { maxNodes }
  )
  expect(metaSchema(input.schema).errorMessage).toBeUndefined()
  const unknown = [...keywordsOf(input.schema)].filter((k) => !KEYWORDS.has(k))
  expect(unknown).toEqual([])
  return input
}

function propertiesOf(schema: JsonSchema): Record<string, JsonSchema> {
  return schema.properties as Record<string, JsonSchema>
}

/** The schema of a value of `type`, as a method's second argument. */
function schemaOf(type: AnyFieldSchema): JsonSchema {
  return propertiesOf(inputOf([c.null, type]).schema).arg1 as JsonSchema
}

function passes(schema: JsonSchema, json: unknown): boolean {
  return ajv.getValidator<unknown>(schema as JsonSchemaType)(json).valid
}

describe("inputShape", () => {
  it("spreads only one record argument that has fields", () => {
    expect(inputShape([])).toEqual({ kind: "none" })
    expect(inputShape([Account])).toEqual({ kind: "fields" })
    expect(inputShape([c.record({ a: c.nat })])).toEqual({ kind: "fields" })
    for (const arg of [
      c.record({}),
      c.unit(),
      c.tuple([c.nat, c.text]),
      c.opt(Account),
      c.vec(Account),
      c.nat,
    ]) {
      expect(inputShape([arg])).toEqual({ kind: "positional", count: 1 })
    }
    expect(inputShape([Account, c.nat])).toEqual({
      kind: "positional",
      count: 2,
    })
  })
})

describe("methodInput: shapes", () => {
  it("writes an empty object for no arguments", () => {
    expect(inputOf([])).toEqual({
      shape: { kind: "none" },
      schema: { type: "object", properties: {}, additionalProperties: false },
      complete: true,
    })
  })

  it("writes the fields of one record argument as the input object", () => {
    expect(inputOf([Account])).toEqual({
      shape: { kind: "fields" },
      schema: {
        type: "object",
        properties: {
          owner: PRINCIPAL,
          subaccount: { anyOf: [BLOB, { type: "null" }] },
        },
        required: ["owner"],
        additionalProperties: false,
      },
      complete: true,
    })
    const { schema } = inputOf([TransferArg])
    expect(Object.keys(propertiesOf(schema))).toEqual([
      "to",
      "fee",
      "memo",
      "from_subaccount",
      "created_at_time",
      "amount",
    ])
    expect(schema.required).toEqual(["to", "amount"])
    expect(propertiesOf(schema).created_at_time).toEqual({
      anyOf: [
        {
          type: "string",
          pattern: "^[0-9]+$",
          description: "nat64, as a decimal string (0 to 18446744073709551615)",
        },
        { type: "null" },
      ],
    })
    expect(propertiesOf(schema).amount).toEqual(NAT)
  })

  it("writes other arguments as arg0, arg1, …, required unless opt", () => {
    expect(inputOf([c.nat, c.opt(c.text)])).toEqual({
      shape: { kind: "positional", count: 2 },
      schema: {
        type: "object",
        properties: {
          arg0: NAT,
          arg1: { anyOf: [TEXT, { type: "null" }] },
        },
        required: ["arg0"],
        additionalProperties: false,
      },
      complete: true,
    })
    const { schema } = inputOf([c.opt(c.nat)])
    expect(schema.required).toBeUndefined()
  })
})

describe("methodInput: each kind", () => {
  it("writes each leaf with its Candid type and format", () => {
    expect(schemaOf(c.nat8)).toEqual(NAT8)
    expect(schemaOf(c.int32)).toEqual({
      type: "integer",
      description: "int32, an integer from -2147483648 to 2147483647",
    })
    expect(schemaOf(c.nat)).toEqual(NAT)
    expect(schemaOf(c.int)).toEqual({
      type: "string",
      pattern: "^-?[0-9]+$",
      description: "int, as a decimal string (any integer)",
    })
    expect(schemaOf(c.nat64).description).toBe(
      "nat64, as a decimal string (0 to 18446744073709551615)"
    )
    expect(schemaOf(c.int64)).toEqual({
      type: "string",
      pattern: "^-?[0-9]+$",
      description:
        "int64, as a decimal string (-9223372036854775808 to 9223372036854775807)",
    })
    expect(schemaOf(c.bool)).toEqual({ type: "boolean", description: "bool" })
    expect(schemaOf(c.null)).toEqual({ type: "null", description: "null" })
    expect(schemaOf(c.text)).toEqual(TEXT)
    expect(schemaOf(c.principal)).toEqual(PRINCIPAL)
    expect(schemaOf(c.float64)).toEqual({
      anyOf: [
        { type: "number" },
        { type: "string", enum: ["NaN", "Infinity", "-Infinity", "-0"] },
      ],
      description:
        'float64, a JSON number (or "NaN", "Infinity", "-Infinity", "-0")',
    })
    expect(schemaOf(c.float32).description).toBe(
      'float32, a JSON number that 32 bits hold exactly, such as 0.5 (or "NaN", "Infinity", "-Infinity", "-0")'
    )
    expect(schemaOf(c.reserved)).toEqual({
      description: "reserved: any value; it is sent as null",
    })
    expect(schemaOf(c.empty)).toEqual({
      description: "empty: this type has no values, so nothing can be sent",
    })
  })

  it("writes blob as hex or utf8, and other vecs as arrays", () => {
    expect(schemaOf(c.blob())).toEqual(BLOB)
    expect(schemaOf(c.vec(c.nat8))).toEqual({ type: "array", items: NAT8 })
    expect(schemaOf(c.vec(c.vec(c.text)))).toEqual({
      type: "array",
      items: { type: "array", items: TEXT },
    })
  })

  it("boxes an opt whose value can be null", () => {
    const boxed = (some: unknown) => ({
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: { some },
          required: ["some"],
          additionalProperties: false,
        },
      ],
      description:
        'opt whose value can itself be null: null for none, { "some": value } for a value',
    })
    expect(schemaOf(c.opt(c.opt(c.nat)))).toEqual(
      boxed({ anyOf: [NAT, { type: "null" }] })
    )
    expect(schemaOf(c.opt(c.null))).toEqual(
      boxed({ type: "null", description: "null" })
    )
    expect(schemaOf(c.opt(c.reserved))).toEqual(
      boxed({ description: "reserved: any value; it is sent as null" })
    )
    expect(schemaOf(c.opt(c.opt(c.opt(c.nat))))).toEqual(
      boxed(boxed({ anyOf: [NAT, { type: "null" }] }))
    )
  })

  it("writes a tuple as an array of exact length", () => {
    expect(schemaOf(c.tuple([c.text, c.nat]))).toEqual({
      type: "array",
      minItems: 2,
      maxItems: 2,
      prefixItems: [TEXT, NAT],
      description: "a tuple: an array of exactly 2 values in order",
    })
    expect(schemaOf(c.tuple([]))).toEqual({
      type: "array",
      minItems: 0,
      maxItems: 0,
      description: "an empty tuple, written []",
    })
  })

  it("writes unit and records, keys exactly as named", () => {
    expect(schemaOf(c.unit())).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
      description: "record {}: the empty record, written {}",
    })
    const schema = schemaOf(
      c.record({
        ["__proto__"]: c.text,
        toString: c.nat8,
        "a b": c.opt(c.nat),
        _0_: c.bool,
      })
    )
    const properties = propertiesOf(schema)
    expect(Object.hasOwn(properties, "__proto__")).toBe(true)
    expect(Object.getPrototypeOf(properties)).toBe(Object.prototype)
    // No additionalProperties: ajv skips a property named __proto__, so it
    // would refuse every value.
    expect(JSON.stringify(schema)).toBe(
      '{"type":"object","properties":{"__proto__":{"type":"string","description":"text"},"toString":{"type":"integer","description":"nat8, an integer from 0 to 255"},"a b":{"anyOf":[{"type":"string","pattern":"^[0-9]+$","description":"nat, as a decimal string (0 or more)"},{"type":"null"}]},"_0_":{"type":"boolean","description":"bool"}},"required":["__proto__","toString","_0_"]}'
    )
    const json = JSON.parse('{"__proto__":"x","toString":1,"_0_":true}')
    expect(passes(schema, json)).toBe(true)
    const plain = schemaOf(c.record({ toString: c.nat8, _0_: c.bool }))
    expect(plain.additionalProperties).toBe(false)
    expect(passes(plain, { toString: 1, _0_: true })).toBe(true)
    expect(passes(plain, { toString: 1, _0_: true, extra: 1 })).toBe(false)
  })

  it("writes a variant as one object per arm, tag a const", () => {
    const schema = schemaOf(
      c.variant({
        Ok: c.nat,
        Pending: c.null,
        Never: c.empty,
        Maybe: c.opt(c.text),
      })
    )
    const tag = (name: string) => ({ type: "string", const: name })
    expect(schema).toEqual({
      oneOf: [
        {
          type: "object",
          properties: { tag: tag("Ok"), value: NAT },
          required: ["tag", "value"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { tag: tag("Pending") },
          required: ["tag"],
          additionalProperties: false,
        },
        // An opt payload is still sent: null is the arm's value.
        {
          type: "object",
          properties: {
            tag: tag("Maybe"),
            value: { anyOf: [TEXT, { type: "null" }] },
          },
          required: ["tag", "value"],
          additionalProperties: false,
        },
      ],
    })
    expect(passes(schema, { tag: "Ok", value: "1" })).toBe(true)
    expect(passes(schema, { tag: "Pending" })).toBe(true)
    expect(passes(schema, { tag: "Maybe", value: null })).toBe(true)
    expect(passes(schema, { tag: "Never" })).toBe(false)
    expect(passes(schema, { tag: "Ok" })).toBe(false)
    expect(schemaOf(c.variant({ Never: c.empty }))).toEqual({
      description:
        "a variant with no arm that has a value: nothing can be sent",
    })
  })

  it("writes func and service references", () => {
    expect(schemaOf(c.func([c.nat], [c.text], "query"))).toEqual({
      type: "object",
      properties: {
        principal: {
          type: "string",
          description:
            "the canister's principal, as text such as ryjl3-tyaaa-aaaaa-aaaba-cai",
        },
        method: { type: "string", description: "the method's name" },
      },
      required: ["principal", "method"],
      additionalProperties: false,
      description:
        "a func reference: a method of type func (nat) -> (text) query",
    })
    expect(schemaOf(c.service({ go: c.func([], [], "update") }))).toEqual({
      type: "string",
      description:
        "a service reference: the canister's principal, as text such as ryjl3-tyaaa-aaaaa-aaaba-cai",
    })
  })
})

describe("methodInput: recursion", () => {
  it("writes a recursive occurrence as a described {}", () => {
    expect(inputOf([List])).toEqual({
      shape: { kind: "fields" },
      schema: {
        type: "object",
        properties: {
          head: NAT,
          tail: {
            anyOf: [
              {
                description:
                  "recursive: a value of the same type as $, record { head : nat; tail : opt … }",
              },
              { type: "null" },
            ],
          },
        },
        required: ["head"],
        additionalProperties: false,
      },
      complete: true,
    })
    expect(schemaOf(Tree)).toEqual({
      oneOf: [
        {
          type: "object",
          properties: { tag: { type: "string", const: "leaf" }, value: NAT },
          required: ["tag", "value"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            tag: { type: "string", const: "node" },
            value: {
              type: "array",
              items: {
                description:
                  "recursive: a value of the same type as $.arg1, variant { leaf : nat; node : vec … }",
              },
            },
          },
          required: ["tag", "value"],
          additionalProperties: false,
        },
      ],
    })
  })

  it("writes a type used twice side by side in full both times", () => {
    const { schema, complete } = inputOf([
      c.record({ from: Account, to: Account }),
    ])
    expect(complete).toBe(true)
    expect(propertiesOf(schema).from).toEqual(propertiesOf(schema).to)
    expect(propertiesOf(propertiesOf(schema).to as JsonSchema).owner).toEqual(
      PRINCIPAL
    )
  })

  it("passes the JSON valueToJson writes", () => {
    const samples: [AnyFieldSchema, unknown][] = [
      [
        TransferArg,
        {
          to: { owner: LEDGER, subaccount: null },
          fee: 10_000n,
          memo: new Uint8Array([1, 2]),
          from_subaccount: null,
          created_at_time: 1_700_000_000_000_000_000n,
          amount: 150_000_000n,
        },
      ],
      [List, { head: 1n, tail: { head: 2n, tail: { head: 3n, tail: null } } }],
      [
        Tree,
        {
          tag: "node",
          value: [
            { tag: "leaf", value: 1n },
            { tag: "node", value: [] },
          ],
        },
      ],
      [c.opt(c.opt(c.nat)), { some: null }],
      [c.opt(c.opt(c.nat)), { some: 5n }],
      [c.opt(c.opt(c.nat)), null],
      [c.tuple([c.text, c.int]), ["a", -1n]],
      [c.variant({ Ok: c.nat, Pending: c.null }), { tag: "Pending" }],
      [c.float32, Number.NaN],
      [c.float64, -0],
      [c.float64, 0.1],
      [c.int8, -128],
      [c.unit(), {}],
      [c.reserved, null],
      [c.func([], [], "query"), { principal: LEDGER, method: "m" }],
      [c.service({}), LEDGER],
      [c.vec(c.principal), [LEDGER]],
    ]
    for (const [type, value] of samples) {
      const json = valueToJson(type, value)
      expect(passes(schemaOf(type), json), JSON.stringify(json)).toBe(true)
    }
  })
})

describe("methodInput: budget", () => {
  it("cuts past maxNodes, naming what was left out", () => {
    const input = inputOf([TransferArg], 4)
    expect(input).toEqual({
      shape: { kind: "fields" },
      schema: {
        type: "object",
        properties: {
          to: {
            type: "object",
            properties: {
              owner: PRINCIPAL,
              subaccount: {
                anyOf: [
                  { description: `blob: cut to fit; ${CUT}` },
                  { type: "null" },
                ],
              },
            },
            required: ["owner"],
            additionalProperties: false,
          },
        },
        required: ["to"],
        description: `5 more fields not shown (cut to fit): "fee", "memo", "from_subaccount", "created_at_time", "amount"; ${CUT}`,
      },
      complete: false,
    })
    // A cut object admits the fields it does not show.
    expect(
      passes(input.schema, {
        to: { owner: "aaaaa-aa" },
        amount: "1",
      })
    ).toBe(true)
  })

  it("keeps a wide record's schema the same size however wide", () => {
    const wide = (count: number) =>
      c.record(
        Object.fromEntries(
          Array.from({ length: count }, (_, i) => [`field_${i}`, TransferArg])
        )
      )
    const sizeOf = (count: number) =>
      JSON.stringify(inputOf([wide(count)]).schema).length
    // Only the count of fields left out grows.
    expect(sizeOf(50_000) - sizeOf(5_000)).toBeLessThan(10)
    expect(sizeOf(5_000)).toBeLessThan(DEFAULT_MAX_NODES * 150)
    const { schema, complete } = inputOf([wide(5_000)])
    expect(complete).toBe(false)
    expect(schema.additionalProperties).toBeUndefined()
    expect(schema.description).toMatch(
      /^\d+ more fields not shown \(cut to fit\): "field_\d+", .* and \d+ more; the describe tool shows the method's Candid$/
    )
    expect(propertiesOf(schema).field_0).toEqual(inputOf([TransferArg]).schema)
  })

  it("keeps many arguments, a wide tuple and a wide variant small", () => {
    const args = inputOf(Array.from({ length: 3000 }, () => c.nat))
    expect(args.complete).toBe(false)
    expect(Object.keys(propertiesOf(args.schema))).toHaveLength(
      DEFAULT_MAX_NODES
    )
    expect(args.schema.description).toBe(
      `1000 more arguments not shown (cut to fit): ${Array.from(
        { length: 20 },
        (_, i) => `"arg${2000 + i}"`
      ).join(", ")} and 980 more; ${CUT}`
    )

    const tuple = schemaOf(
      c.tuple(Array.from({ length: 100_000 }, () => c.nat))
    )
    expect(tuple.minItems).toBe(100_000)
    expect(tuple.maxItems).toBe(100_000)
    expect((tuple.prefixItems as unknown[]).length).toBeLessThan(
      DEFAULT_MAX_NODES
    )
    expect(tuple.description).toMatch(
      /^a tuple of 100000 values in order, the first \d+ shown \(cut to fit\); /
    )

    const wideVariant = (count: number) =>
      c.variant(
        Object.fromEntries(
          Array.from({ length: count }, (_, i) => [`Arm${i}`, c.nat])
        )
      )
    const variant = schemaOf(wideVariant(5_000))
    expect(
      JSON.stringify(schemaOf(wideVariant(50_000))).length -
        JSON.stringify(variant).length
    ).toBeLessThan(10)
    const branches = variant.anyOf as JsonSchema[]
    const rest = branches.at(-1) as JsonSchema
    expect(rest).toMatchObject({
      type: "object",
      properties: { tag: { type: "string" } },
      required: ["tag"],
    })
    expect(rest.description).toMatch(
      /^one of the \d+ arms not shown \(cut to fit\): "Arm\d+", .* and \d+ more; /
    )
    expect(passes(variant, { tag: "Arm4999", value: "1" })).toBe(true)
  })

  it("cuts nesting deeper than a tool input may have", () => {
    let deep: AnyFieldSchema = c.nat
    for (let i = 0; i < 100; i++) deep = c.vec(deep)
    const { schema, complete } = inputOf([deep])
    expect(complete).toBe(false)
    let level = propertiesOf(schema).arg0 as JsonSchema
    let depth = 1
    while (level.items !== undefined) {
      level = level.items as JsonSchema
      depth++
    }
    expect(depth).toBe(65)
    expect(level).toEqual({
      description: "nested deeper than the 64 levels a tool input may have",
    })
  })

  it("stays bounded on a type that grows without end", () => {
    // Each rec makes a fresh node: no identity repeats, so only the
    // bounds stop the writer.
    const endless = (): AnyFieldSchema =>
      c.rec(() => c.record({ next: endless(), value: c.nat }))
    const input = inputOf([endless()])
    expect(input.complete).toBe(false)
    expect(JSON.stringify(input.schema).length).toBeLessThan(200_000)
  })

  it("refuses a maxNodes that is not a positive integer", () => {
    expect(DEFAULT_MAX_NODES).toBe(2000)
    for (const maxNodes of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => methodInput([c.nat], { maxNodes })).toThrow(TypeError)
    }
    expect(inputOf([TransferArg], 1).schema).toEqual({
      type: "object",
      properties: {},
      description: `6 more fields not shown (cut to fit): "to", "fee", "memo", "from_subaccount", "created_at_time", "amount"; ${CUT}`,
    })
  })
})
