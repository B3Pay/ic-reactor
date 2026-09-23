import * as z from "zod"
import type { Principal } from "@icp-sdk/core/principal"
import type {
  IsOptionalType,
  IsBlobType,
  UnionToTuple,
} from "../types/transform.js"
import type {
  CandidVariantKey,
  CandidVariantValue,
  IsCandidVariant,
} from "../types/variant.js"

type VariantsOf<T, TBlob> =
  T extends Record<infer K extends CandidVariantKey<T>, any>
    ? { _type: K } & (CandidVariantValue<T, K> extends null
        ? {}
        : { [P in K]: DisplayOf<CandidVariantValue<T, K>, TBlob> })
    : never

type VariantUnionOf<T, TBlob> =
  UnionToTuple<T> extends infer U
    ? U extends any[]
      ? { [K in keyof U]: VariantsOf<U[K], TBlob> }[number]
      : never
    : never

type CombineObjects<Required, Optional> = keyof Optional extends never
  ? Required
  : keyof Required extends never
    ? Optional
    : Required & Optional

type AsObject<T, TBlob> = CombineObjects<
  {
    [K in keyof T as IsOptionalType<T[K]> extends true ? never : K]: DisplayOf<
      T[K],
      TBlob
    >
  },
  {
    [K in keyof T as IsOptionalType<T[K]> extends true ? K : never]?: DisplayOf<
      T[K],
      TBlob
    >
  }
>

/**
 * Whether A and B are the same type. Assignability both ways is not enough:
 * `opt reserved` wraps `any`, which is assignable to and from every optional.
 */
type IsSameType<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
    ? true
    : false

type IsInChain<T, Chain extends unknown[]> = Chain extends [
  infer Head,
  ...infer Rest,
]
  ? IsSameType<T, Head> extends true
    ? true
    : IsInChain<T, Rest>
  : false

/**
 * `opt T` displays as T's display type, `null` or `undefined`, and so do
 * nested optionals around T.
 *
 * `Chain` lists the optionals found so far directly inside one another. One
 * that contains itself that way, `type T = opt T`, holds nothing but more
 * optionals, which all display as `null` or `undefined`. Expanding it would
 * never end, so it stops when an optional comes round a second time.
 */
type AsOptional<T, TBlob, Chain extends unknown[] = []> = T extends [infer U]
  ? NullishType<
      IsOptionalType<U> extends true
        ? IsInChain<U, Chain> extends true
          ? never
          : AsOptional<U, TBlob, [...Chain, U]>
        : DisplayOf<U, TBlob>
    >
  : never

/** The elements of those members of T that are arrays or tuples. */
type ElementsOf<T> = Extract<T, readonly unknown[]>[number]

/**
 * Whether the elements of T's elements include an array or a tuple: arrays
 * three deep, counting T. Optionals, vectors, tuples, maps and blobs are all
 * arrays in generated declarations.
 *
 * TypeScript builds most of a display type as soon as it is named. Only an
 * object type's members wait until something reads them, so a record field or
 * a variant arm stops a type that contains itself, such as ICRC-3's `Value`.
 * An optional, a vector, a tuple or a map had no such stop: a mapped type over
 * a tuple builds every element at once, and `Record<string, X>` builds X. For
 * Motoko's `type List = opt record { int; List }` that started
 * `DisplayOf<List>` again before it had finished, until TypeScript gave up
 * with TS2589, "Type instantiation is excessively deep and possibly infinite".
 *
 * Array and tuple type literals wait until their elements are read, too.
 * Without a record or variant in between, a type can only lead back to itself
 * through arrays within arrays, endlessly deep. So a vector, tuple or map whose
 * element nests arrays this deep is written as one of those literals, or as a
 * mapped type over `string` for a map. Anything shallower is built as before,
 * into exactly the same types.
 */
type NestsArrays<T> = [
  Extract<ElementsOf<ElementsOf<T>>, readonly unknown[]>,
] extends [never]
  ? false
  : true

type MapElements<T, TBlob> = { [K in keyof T]: DisplayOf<T[K], TBlob> }

/**
 * A vector or tuple displays as an array of its elements' display types. See
 * {@link NestsArrays} for when it is built lazily.
 *
 * A tuple type literal has a fixed length, so tuples of 2 to 8 elements are
 * spelled out. (A 1-tuple never gets here: it has the shape of an optional.) A
 * longer tuple, or one with optional or rest elements, keeps the mapped type,
 * and still fails with TS2589 if it contains itself.
 */
type AsArrayOrTuple<T extends any[], TBlob> =
  NestsArrays<T[number]> extends false
    ? MapElements<T, TBlob>
    : number extends T["length"]
      ? T extends Array<infer E>
        ? E[] extends T
          ? DisplayOf<E, TBlob>[]
          : MapElements<T, TBlob>
        : MapElements<T, TBlob>
      : AsTuple<T, TBlob>

type AsTuple<T extends any[], TBlob> = T["length"] extends 2
  ? [DisplayOf<T[0], TBlob>, DisplayOf<T[1], TBlob>]
  : T["length"] extends 3
    ? [DisplayOf<T[0], TBlob>, DisplayOf<T[1], TBlob>, DisplayOf<T[2], TBlob>]
    : T["length"] extends 4
      ? [
          DisplayOf<T[0], TBlob>,
          DisplayOf<T[1], TBlob>,
          DisplayOf<T[2], TBlob>,
          DisplayOf<T[3], TBlob>,
        ]
      : T["length"] extends 5
        ? [
            DisplayOf<T[0], TBlob>,
            DisplayOf<T[1], TBlob>,
            DisplayOf<T[2], TBlob>,
            DisplayOf<T[3], TBlob>,
            DisplayOf<T[4], TBlob>,
          ]
        : T["length"] extends 6
          ? [
              DisplayOf<T[0], TBlob>,
              DisplayOf<T[1], TBlob>,
              DisplayOf<T[2], TBlob>,
              DisplayOf<T[3], TBlob>,
              DisplayOf<T[4], TBlob>,
              DisplayOf<T[5], TBlob>,
            ]
          : T["length"] extends 7
            ? [
                DisplayOf<T[0], TBlob>,
                DisplayOf<T[1], TBlob>,
                DisplayOf<T[2], TBlob>,
                DisplayOf<T[3], TBlob>,
                DisplayOf<T[4], TBlob>,
                DisplayOf<T[5], TBlob>,
                DisplayOf<T[6], TBlob>,
              ]
            : T["length"] extends 8
              ? [
                  DisplayOf<T[0], TBlob>,
                  DisplayOf<T[1], TBlob>,
                  DisplayOf<T[2], TBlob>,
                  DisplayOf<T[3], TBlob>,
                  DisplayOf<T[4], TBlob>,
                  DisplayOf<T[5], TBlob>,
                  DisplayOf<T[6], TBlob>,
                  DisplayOf<T[7], TBlob>,
                ]
              : MapElements<T, TBlob>

/**
 * Generated declarations type a fixed-width integer vector (anything but blob)
 * as a typed array OR a plain array, because `IDL.decode` returns the typed
 * array. `vec nat32` is `Uint32Array | number[]` and `vec nat64` is
 * `BigUint64Array | bigint[]`. The display codec returns a plain array of
 * display elements. Without this branch the union reaches the variant check
 * below, which treats any union as a variant and maps it to an unusable object.
 */
type NumericTypedArray =
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | BigUint64Array
  | BigInt64Array
  | Float32Array
  | Float64Array

type IsTypedArrayVector<T> = [Extract<T, NumericTypedArray>] extends [never]
  ? false
  : true

// Maps the element type directly. Sending `number[]` back through DisplayOf
// would match IsBlobType, which treats a bare `number[]` as a blob.
type AsTypedArrayVector<T, TBlob> =
  Exclude<T, NumericTypedArray> extends Array<infer E>
    ? Array<DisplayOf<E, TBlob>>
    : never

/**
 * The display-side forms a blob ARGUMENT may take: the codec's encode accepts
 * a hex string, raw bytes, or a plain byte array. Decode is narrower — every
 * blob RESULT is a hex string, which is what {@link DisplayResultOf} maps to.
 */
export type BlobType = Uint8Array | number[] | string

export type NullishType<T> = T | null | undefined

export type DisplayCommonType<T> = T extends string
  ? string
  : T extends bigint
    ? string
    : T extends number
      ? number
      : T extends boolean
        ? boolean
        : T

export type DisplayOf<T, TBlob = BlobType> =
  IsOptionalType<T> extends true
    ? AsOptional<T, TBlob>
    : IsBlobType<T> extends true
      ? TBlob
      : IsTypedArrayVector<T> extends true
        ? AsTypedArrayVector<T, TBlob>
        : IsCandidVariant<T> extends true
          ? VariantUnionOf<T, TBlob>
          : T extends Array<[string, infer B]>
            ? NestsArrays<B> extends true
              ? // The same type as the Record below, built lazily.
                { [K in string]: DisplayOf<B, TBlob> }
              : Record<string, DisplayOf<B, TBlob>>
            : T extends any[]
              ? AsArrayOrTuple<T, TBlob>
              : T extends null
                ? null
                : T extends Principal
                  ? string
                  : T extends object
                    ? AsObject<T, TBlob>
                    : DisplayCommonType<T>

/**
 * Display mapping for RESULT position. Identical to {@link DisplayOf} except
 * that a blob is exactly `string`: the display codec decodes every blob to a
 * hex string, whatever its size, so the wider {@link BlobType} union belongs
 * only on the args side, where encode genuinely accepts all three forms.
 */
export type DisplayResultOf<T> = DisplayOf<T, string>

export type DisplayCodec<TC = unknown, TD = DisplayOf<TC>> = z.ZodCodec<
  z.ZodType<TC>,
  z.ZodType<TD>
>

export interface ActorDisplayCodec<TC = unknown, TD = DisplayOf<TC>> {
  codec: DisplayCodec<TC, TD>
  asDisplay: (val: TC) => TD
  asCandid: (val: TD) => TC
}
