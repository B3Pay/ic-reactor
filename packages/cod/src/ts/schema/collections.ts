import { Schema, type AnySchema, type Infer, type InferWire } from "./core.js"
import type {
  RecordApp,
  RecordWire,
  SchemaFields,
  StringKeyOf,
  TupleApp,
  TupleWire,
  VariantApp,
  VariantWire,
} from "./types.js"
import { candidLabel } from "./utils.js"

/**
 * Schema implementation for Candid `opt` values.
 *
 * @typeParam WireType - Wire-level type of the inner schema.
 * @typeParam AppType - App-level type of the inner schema.
 */
export class OptionalSchema<WireType, AppType> extends Schema<
  WireType | null,
  AppType | null
> {
  /**
   * Maps absent optional values to `undefined` in application code.
   *
   * `undefined` and `null` both encode as the Candid `null` optional case.
   *
   * @returns Schema with `undefined` instead of `null` in its app-level type.
   */
  optional(): Schema<WireType | null, Exclude<AppType, null> | undefined> {
    return this.codec<Exclude<AppType, null> | undefined>({
      name: "opt.optional",
      encode: (value) => {
        if (value === undefined || value === null) {
          return null
        }
        return this.toWire(value as AppType)
      },
      decode: (value) => {
        const appValue = this.fromWire(value)
        return appValue === null
          ? undefined
          : (appValue as Exclude<AppType, null>)
      },
    })
  }
}

/**
 * Creates a schema for a Candid `opt` value.
 *
 * @typeParam Inner - Inner schema type.
 * @param inner - Schema for the optional value.
 * @returns Optional schema whose wire and app values are either the inner value or `null`.
 */
export function opt<Inner extends AnySchema>(
  inner: Inner
): OptionalSchema<InferWire<Inner>, Infer<Inner>> {
  return new OptionalSchema<InferWire<Inner>, Infer<Inner>>({
    did: () => `opt ${inner.wireDid()}`,
    toWire: (value) => (value === null ? null : inner.toWire(value)),
    fromWire: (value) => (value === null ? null : inner.fromWire(value)),
    wireToText: (value) =>
      value === null ? "null" : `opt (${inner.wireToCandid(value)})`,
    textToWire: (parser) => {
      if (parser.consumeWord("null")) {
        return null
      }
      parser.expectWord("opt")
      return inner.parseWire(parser)
    },
    codecs: [],
  })
}

/**
 * Creates a schema for a Candid `vec` value.
 *
 * @typeParam Inner - Element schema type.
 * @param inner - Schema for each vector element.
 * @returns Array schema for the inner values.
 */
export function vec<Inner extends AnySchema>(
  inner: Inner
): Schema<Array<InferWire<Inner>>, Array<Infer<Inner>>> {
  return new Schema<Array<InferWire<Inner>>, Array<Infer<Inner>>>({
    did: () => `vec ${inner.wireDid()}`,
    toWire: (value) => value.map((item) => inner.toWire(item)),
    fromWire: (value) => value.map((item) => inner.fromWire(item)),
    wireToText: (value) =>
      `vec { ${value.map((item) => inner.wireToCandid(item)).join("; ")} }`,
    textToWire: (parser) => {
      parser.expectWord("vec")
      parser.expectChar("{")
      const values: Array<InferWire<Inner>> = []
      while (!parser.consumeChar("}")) {
        values.push(inner.parseWire(parser))
        parser.consumeChar(";")
      }
      return values
    },
    codecs: [],
  })
}

/**
 * Creates a tuple-like schema encoded as a Candid positional record.
 *
 * @typeParam Items - Ordered item schemas.
 * @param items - Schemas for each tuple position.
 * @returns Schema whose app and wire values are arrays aligned with `items`.
 */
export function tuple<const Items extends readonly AnySchema[]>(
  items: Items
): Schema<TupleWire<Items>, TupleApp<Items>> {
  return new Schema<TupleWire<Items>, TupleApp<Items>>({
    did: () => `record { ${items.map((item) => item.wireDid()).join("; ")} }`,
    toWire: (value) =>
      items.map((item, index) => item.toWire(value[index])) as TupleWire<Items>,
    fromWire: (value) =>
      items.map((item, index) =>
        item.fromWire(value[index])
      ) as TupleApp<Items>,
    wireToText: (value) =>
      `record { ${items.map((item, index) => item.wireToCandid(value[index])).join("; ")} }`,
    textToWire: (parser) => {
      parser.expectWord("record")
      parser.expectChar("{")
      const values = items.map((item, index) => {
        const value = item.parseWire(parser)
        if (index < items.length - 1) {
          parser.expectChar(";")
        } else {
          parser.consumeChar(";")
        }
        return value
      })
      parser.expectChar("}")
      return values as TupleWire<Items>
    },
    codecs: [],
  })
}

/**
 * Creates a schema for a Candid named record.
 *
 * @typeParam Fields - Mapping of record field names to schemas.
 * @param fields - Field schemas keyed by Candid labels.
 * @returns Schema for app and wire objects with the same field names.
 */
export function record<const Fields extends SchemaFields>(
  fields: Fields
): Schema<RecordWire<Fields>, RecordApp<Fields>> {
  const keys = Object.keys(fields) as Array<StringKeyOf<Fields>>
  const fieldMap = new Map(keys.map((key) => [key, fields[key]!] as const))

  return new Schema<RecordWire<Fields>, RecordApp<Fields>>({
    did: () =>
      `record { ${keys.map((key) => `${candidLabel(key)} : ${fields[key]!.wireDid()}`).join("; ")} }`,
    toWire: (value) => {
      const wire: Partial<RecordWire<Fields>> = {}
      for (const key of keys) {
        wire[key] = fields[key]!.toWire(value[key])
      }
      return wire as RecordWire<Fields>
    },
    fromWire: (value) => {
      const app: Partial<RecordApp<Fields>> = {}
      for (const key of keys) {
        app[key] = fields[key]!.fromWire(value[key])
      }
      return app as RecordApp<Fields>
    },
    wireToText: (value) => {
      const parts = keys.map(
        (key) =>
          `${candidLabel(key)} = ${fields[key]!.wireToCandid(value[key])}`
      )
      return `record { ${parts.join("; ")} }`
    },
    textToWire: (parser) => {
      parser.expectWord("record")
      parser.expectChar("{")
      const wire: Partial<RecordWire<Fields>> = {}
      const seen = new Set<string>()

      while (!parser.consumeChar("}")) {
        const label = parser.parseLabel()
        const field = fieldMap.get(label as StringKeyOf<Fields>)
        if (!field) {
          throw parser.error(`unexpected record field ${JSON.stringify(label)}`)
        }
        parser.expectChar("=")
        wire[label as keyof Fields] = field.parseWire(parser)
        seen.add(label)
        parser.consumeChar(";")
      }

      for (const key of keys) {
        if (!seen.has(key)) {
          throw parser.error(`missing record field ${JSON.stringify(key)}`)
        }
      }

      return wire as RecordWire<Fields>
    },
    codecs: [],
  })
}

/**
 * Creates a schema for a Candid variant.
 *
 * @typeParam Fields - Mapping of variant case names to schemas.
 * @param fields - Case schemas keyed by Candid labels.
 * @returns Schema for single-key variant objects.
 */
export function variant<const Fields extends SchemaFields>(
  fields: Fields
): Schema<VariantWire<Fields>, VariantApp<Fields>> {
  const keys = Object.keys(fields) as Array<StringKeyOf<Fields>>
  const fieldMap = new Map(keys.map((key) => [key, fields[key]!] as const))

  return new Schema<VariantWire<Fields>, VariantApp<Fields>>({
    did: () =>
      `variant { ${keys
        .map((key) => {
          const field = fields[key]!
          return field.wireDid() === "null"
            ? candidLabel(key)
            : `${candidLabel(key)} : ${field.wireDid()}`
        })
        .join("; ")} }`,
    toWire: (value) => {
      const entries = Object.entries(value) as Array<
        [StringKeyOf<Fields>, unknown]
      >
      if (entries.length !== 1) {
        throw new Error("variant value must contain exactly one case")
      }
      const [key, appValue] = entries[0]!
      const field = fields[key]
      if (!field) {
        throw new Error(`unknown variant case ${JSON.stringify(key)}`)
      }
      return { [key]: field.toWire(appValue) } as VariantWire<Fields>
    },
    fromWire: (value) => {
      const entries = Object.entries(value) as Array<
        [StringKeyOf<Fields>, unknown]
      >
      if (entries.length !== 1) {
        throw new Error("wire variant value must contain exactly one case")
      }
      const [key, wireValue] = entries[0]!
      const field = fields[key]
      if (!field) {
        throw new Error(`unknown variant case ${JSON.stringify(key)}`)
      }
      return { [key]: field.fromWire(wireValue) } as VariantApp<Fields>
    },
    wireToText: (value) => {
      const entries = Object.entries(value) as Array<
        [StringKeyOf<Fields>, unknown]
      >
      if (entries.length !== 1) {
        throw new Error("wire variant value must contain exactly one case")
      }
      const [key, wireValue] = entries[0]!
      const field = fields[key]
      if (!field) {
        throw new Error(`unknown variant case ${JSON.stringify(key)}`)
      }
      if (field.wireDid() === "null") {
        return `variant { ${candidLabel(key)} }`
      }
      return `variant { ${candidLabel(key)} = ${field.wireToCandid(wireValue)} }`
    },
    textToWire: (parser) => {
      parser.expectWord("variant")
      parser.expectChar("{")
      const label = parser.parseLabel() as StringKeyOf<Fields>
      const field = fieldMap.get(label)
      if (!field) {
        throw parser.error(`unexpected variant case ${JSON.stringify(label)}`)
      }
      const value = parser.consumeChar("=") ? field.parseWire(parser) : null
      parser.consumeChar(";")
      parser.expectChar("}")
      return { [label]: value } as VariantWire<Fields>
    },
    codecs: [],
  })
}
