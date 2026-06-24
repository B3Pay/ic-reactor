import type { CandidCodec } from "../codec"

/** Infer the TS type carried by a codec. */
export type Infer<T> = T extends CandidCodec<infer U> ? U : never

/** Map a record of codecs to a record of inferred types. */
export type InferRecord<T extends Record<string, CandidCodec<unknown>>> = {
  [K in keyof T]: Infer<T[K]>
}

/**
 * Infer a Candid variant union from a record of codecs.
 * Each variant arm becomes `{ [K]: Infer<V> }`.
 */
export type InferVariant<T extends Record<string, CandidCodec<unknown>>> = {
  [K in keyof T]: Record<K, Infer<T[K]>>
}[keyof T]

/** Infer a tuple from an array of codecs. */
export type InferTuple<T extends readonly CandidCodec<unknown>[]> = {
  [K in keyof T]: T[K] extends CandidCodec<infer U> ? U : never
}
