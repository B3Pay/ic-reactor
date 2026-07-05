import type { AnySchema, Infer, InferWire } from "./core.js"

/**
 * Blob input accepted by the schema runtime.
 */
export type BlobLike = Uint8Array | number[]

/**
 * Extracts string keys from a type.
 *
 * @typeParam T - Object-like type to inspect.
 */
export type StringKeyOf<T> = Extract<keyof T, string>

/**
 * Mapping of Candid field or case names to schemas.
 */
export type SchemaFields = Record<string, AnySchema>

/**
 * Wire-level object type inferred from record field schemas.
 *
 * @typeParam Fields - Record field schema map.
 */
export type RecordWire<Fields extends SchemaFields> = {
  -readonly [Key in keyof Fields]: InferWire<Fields[Key]>
}

/**
 * App-level object type inferred from record field schemas.
 *
 * @typeParam Fields - Record field schema map.
 */
export type RecordApp<Fields extends SchemaFields> = {
  -readonly [Key in keyof Fields]: Infer<Fields[Key]>
}

/**
 * Wire-level discriminated object union inferred from variant case schemas.
 *
 * @typeParam Fields - Variant case schema map.
 */
export type VariantWire<Fields extends SchemaFields> = {
  [Key in StringKeyOf<Fields>]: {
    [VariantKey in Key]: InferWire<Fields[VariantKey]>
  }
}[StringKeyOf<Fields>]

/**
 * App-level discriminated object union inferred from variant case schemas.
 *
 * @typeParam Fields - Variant case schema map.
 */
export type VariantApp<Fields extends SchemaFields> = {
  [Key in StringKeyOf<Fields>]: {
    [VariantKey in Key]: Infer<Fields[VariantKey]>
  }
}[StringKeyOf<Fields>]

/**
 * Wire-level tuple inferred from positional item schemas.
 *
 * @typeParam Items - Tuple item schema list.
 */
export type TupleWire<Items extends readonly AnySchema[]> = {
  readonly [Key in keyof Items]: InferWire<Items[Key]>
}

/**
 * App-level tuple inferred from positional item schemas.
 *
 * @typeParam Items - Tuple item schema list.
 */
export type TupleApp<Items extends readonly AnySchema[]> = {
  readonly [Key in keyof Items]: Infer<Items[Key]>
}
