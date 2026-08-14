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

type AsOptional<T, TBlob> = T extends [infer U]
  ? NullishType<DisplayOf<U, TBlob>>
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
      : IsCandidVariant<T> extends true
        ? VariantUnionOf<T, TBlob>
        : T extends Array<[string, infer B]>
          ? Record<string, DisplayOf<B, TBlob>>
          : T extends any[]
            ? { [K in keyof T]: DisplayOf<T[K], TBlob> }
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
