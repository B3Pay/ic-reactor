import * as z from "zod"
import type { Principal } from "@icp-sdk/core/principal"
import type {
  IsOptionalType,
  IsBlobType,
  UnionToTuple,
} from "../types/transform"
import type {
  CandidVariantKey,
  CandidVariantValue,
  IsCandidVariant,
} from "../types/variant"

type VariantsOf<T> =
  T extends Record<infer K extends CandidVariantKey<T>, any>
    ? { _type: K } & (CandidVariantValue<T, K> extends null
        ? {}
        : { [P in K]: DisplayOf<CandidVariantValue<T, K>> })
    : never

type VariantUnionOf<T> =
  UnionToTuple<T> extends infer U
    ? U extends any[]
      ? { [K in keyof U]: VariantsOf<U[K]> }[number]
      : never
    : never

type CombineObjects<Required, Optional> = keyof Optional extends never
  ? Required
  : keyof Required extends never
    ? Optional
    : Required & Optional

type AsObject<T> = CombineObjects<
  {
    [K in keyof T as IsOptionalType<T[K]> extends true ? never : K]: DisplayOf<
      T[K]
    >
  },
  {
    [K in keyof T as IsOptionalType<T[K]> extends true ? K : never]?: DisplayOf<
      T[K]
    >
  }
>

type AsOptional<T> = T extends [infer U] ? NullishType<DisplayOf<U>> : never

export type BlobType = Uint8Array | number[] | `0x${string}`

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

export type DisplayOf<T> =
  IsOptionalType<T> extends true
    ? AsOptional<T>
    : IsBlobType<T> extends true
      ? BlobType
      : IsCandidVariant<T> extends true
        ? VariantUnionOf<T>
        : T extends Array<[string, infer B]>
          ? Map<string, DisplayOf<B>>
          : T extends (infer U)[]
            ? DisplayOf<U>[]
            : T extends null
              ? null
              : T extends Principal
                ? string
                : T extends object
                  ? AsObject<T>
                  : DisplayCommonType<T>

export type DisplayCodec<TC = unknown, TD = DisplayOf<TC>> = z.ZodCodec<
  z.ZodType<TC>,
  z.ZodType<TD>
>

export interface ActorDisplayCodec<TC = unknown, TD = DisplayOf<TC>> {
  codec: DisplayCodec<TC, TD>
  asDisplay: (val: TC) => TD
  asCandid: (val: TD) => TC
}
