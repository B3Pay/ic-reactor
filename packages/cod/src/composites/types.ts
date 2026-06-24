import type { CandidCodec } from "../codec"

/** Infer the TS type carried by a codec. */
export type Infer<T> = T extends CandidCodec<infer U> ? U : never

/** Bindgen-style nested option wrapper for ambiguous `opt opt T` values. */
export interface Some<T> {
  __kind__: "Some"
  value: T
}

/** Bindgen-style nested option wrapper for absent `opt opt T` values. */
export interface None {
  __kind__: "None"
}

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type OptionalKeys<T extends Record<string, CandidCodec<unknown>>> = {
  [K in keyof T]: T[K] extends { readonly kind: "opt" } ? K : never
}[keyof T]

type RequiredKeys<T extends Record<string, CandidCodec<unknown>>> = Exclude<
  keyof T,
  OptionalKeys<T>
>

type InferOptionalField<T> = T extends {
  readonly inner: infer Inner extends CandidCodec<unknown>
}
  ? Infer<Inner>
  : never

/** Infer `opt T` as `T | null`, with `Some`/`None` for nested options. */
export type InferOpt<T extends CandidCodec<unknown>> = T extends {
  readonly kind: "opt"
}
  ? Some<Infer<T>> | None
  : Infer<T> | null

/**
 * Map a record of codecs to a bindgen-style object type.
 * `opt` fields become optional properties whose value is the inner type.
 */
export type InferRecord<T extends Record<string, CandidCodec<unknown>>> =
  Simplify<
    {
      [K in RequiredKeys<T>]: Infer<T[K]>
    } & {
      [K in OptionalKeys<T>]?: InferOptionalField<T[K]>
    }
  >

type VariantPayloadKeys<T extends Record<string, CandidCodec<unknown>>> = {
  [K in keyof T]: T[K] extends { readonly kind: "null" } ? never : K
}[keyof T]

type VariantArm<
  T extends Record<string, CandidCodec<unknown>>,
  K extends keyof T,
> = Simplify<
  {
    __kind__: K & string
  } & {
    [P in K]: Infer<T[P]>
  }
>

/**
 * Infer a Candid variant using bindgen-compatible shapes.
 * All-null variants infer to a string-literal enum shape; variants with any
 * payload infer to a `__kind__` discriminated union.
 */
export type InferVariant<T extends Record<string, CandidCodec<unknown>>> = [
  VariantPayloadKeys<T>,
] extends [never]
  ? Extract<keyof T, string>
  : {
      [K in keyof T]: VariantArm<T, K>
    }[keyof T]

/** Infer a tuple from an array of codecs. */
export type InferTuple<T extends readonly CandidCodec<unknown>[]> = {
  [K in keyof T]: T[K] extends CandidCodec<infer U> ? U : never
}
