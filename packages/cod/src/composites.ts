/**
 * Candid Codec — Composite Types
 *
 * `opt`, `vec`, `record`, `variant`, and `tuple` codecs.
 * Each wraps inner codecs and delegates to the corresponding IDL constructor.
 */

import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "./codec"
import type { CandidMetadata } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Type-Level Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Infer the TS type carried by a codec. */
export type Infer<T> = T extends CandidCodec<infer U> ? U : never

/** Map a record of codecs to a record of inferred types. */
type InferRecord<T extends Record<string, CandidCodec<unknown>>> = {
  [K in keyof T]: Infer<T[K]>
}

/**
 * Infer a Candid variant union from a record of codecs.
 * Each variant arm becomes `{ [K]: Infer<V> }`.
 */
type InferVariant<T extends Record<string, CandidCodec<unknown>>> = {
  [K in keyof T]: Record<K, Infer<T[K]>>
}[keyof T]

/** Infer a tuple from an array of codecs. */
type InferTuple<T extends readonly CandidCodec<unknown>[]> = {
  [K in keyof T]: T[K] extends CandidCodec<infer U> ? U : never
}

// ─────────────────────────────────────────────────────────────────────────────
// Opt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candid `opt T` → `[] | [T]`
 *
 * Follows the standard Candid opt encoding used by `@icp-sdk/core`.
 */
export class CandidOptCodec<T> extends CandidCodec<[] | [T]> {
  readonly kind = "opt" as const

  constructor(
    readonly inner: CandidCodec<T>,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<[] | [T]> {
    return IDL.Opt(this.inner.toIDL()) as IDL.Type<[] | [T]>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidOptCodec(this.inner, metadata) as this
  }
}

/** Create an opt codec wrapping `inner`. */
export function opt<T>(inner: CandidCodec<T>): CandidOptCodec<T> {
  return new CandidOptCodec(inner)
}

// ─────────────────────────────────────────────────────────────────────────────
// Vec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candid `vec T` → `T[]`
 */
export class CandidVecCodec<T> extends CandidCodec<T[]> {
  readonly kind = "vec" as const

  constructor(
    readonly inner: CandidCodec<T>,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<T[]> {
    return IDL.Vec(this.inner.toIDL()) as IDL.Type<T[]>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidVecCodec(this.inner, metadata) as this
  }
}

/** Create a vec codec wrapping `inner`. */
export function vec<T>(inner: CandidCodec<T>): CandidVecCodec<T> {
  return new CandidVecCodec(inner)
}

// ─────────────────────────────────────────────────────────────────────────────
// Record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candid `record { ... }` → `{ [K]: T }`
 */
export class CandidRecordCodec<
  F extends Record<string, CandidCodec<unknown>>,
> extends CandidCodec<InferRecord<F>> {
  readonly kind = "record" as const

  constructor(
    readonly fields: F,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferRecord<F>> {
    const idlFields: Record<string, IDL.Type> = {}
    for (const [key, codec] of Object.entries(this.fields)) {
      idlFields[key] = codec.toIDL()
    }
    return IDL.Record(idlFields) as unknown as IDL.Type<InferRecord<F>>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidRecordCodec(this.fields, metadata) as this
  }
}

/** Create a record codec from a map of field codecs. */
export function record<F extends Record<string, CandidCodec<unknown>>>(
  fields: F
): CandidRecordCodec<F> {
  return new CandidRecordCodec(fields)
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candid `variant { ... }` → discriminated union `{ Ok: T } | { Err: E }`
 */
export class CandidVariantCodec<
  F extends Record<string, CandidCodec<unknown>>,
> extends CandidCodec<InferVariant<F>> {
  readonly kind = "variant" as const

  constructor(
    readonly fields: F,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferVariant<F>> {
    const idlFields: Record<string, IDL.Type> = {}
    for (const [key, codec] of Object.entries(this.fields)) {
      idlFields[key] = codec.toIDL()
    }
    return IDL.Variant(idlFields) as unknown as IDL.Type<InferVariant<F>>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidVariantCodec(this.fields, metadata) as this
  }
}

/** Create a variant codec from a map of arm codecs. */
export function variant<F extends Record<string, CandidCodec<unknown>>>(
  fields: F
): CandidVariantCodec<F> {
  return new CandidVariantCodec(fields)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuple
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Candid `record { 0: A; 1: B; ... }` (positional) → `[A, B, ...]`
 */
export class CandidTupleCodec<
  E extends readonly CandidCodec<unknown>[],
> extends CandidCodec<InferTuple<E>> {
  readonly kind = "tuple" as const

  constructor(
    readonly elements: E,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  toIDL(): IDL.Type<InferTuple<E>> {
    const idlTypes = this.elements.map((el) => el.toIDL())
    return IDL.Tuple(...idlTypes) as unknown as IDL.Type<InferTuple<E>>
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidTupleCodec(this.elements, metadata) as this
  }
}

/** Create a tuple codec from an array of element codecs. */
export function tuple<E extends readonly CandidCodec<unknown>[]>(
  elements: [...E]
): CandidTupleCodec<E> {
  return new CandidTupleCodec(elements)
}
