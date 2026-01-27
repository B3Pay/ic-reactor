import * as z from "zod"
import { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import {
  CandidVariantKey,
  CandidVariantValue,
  IsBlobType,
  IsCandidVariant,
  IsOptionalType,
  UnionToTuple,
} from "@ic-reactor/core"

/**
 * Maps one branch of the variant union into a Zod object.
 *
 * For a branch like `{ Inactive: null }` this produces:
 *
 *    z.object({ _type: z.literal("Inactive") })
 *
 * For a branch with an associated value (non-null), it adds an optional property.
 */
type ZodVariantMember<T> =
  T extends Record<infer K extends CandidVariantKey<T> & string, any>
    ? z.ZodObject<
        {
          _type: z.ZodLiteral<K>
        } & (CandidVariantValue<T, K> extends null
          ? {}
          : { [P in K]: ZodSchemaOf<CandidVariantValue<T, K>> })
      >
    : never

type ZodVariantUnionOf<T> =
  UnionToTuple<T> extends infer U
    ? U extends any[]
      ? {
          [K in keyof U]: ZodVariantMember<U[K]>
        }
      : never
    : never

type ZodVariantOf<T> = z.ZodDiscriminatedUnion<ZodVariantUnionOf<T>, "_type">

type ZodObjectOf<T> = z.ZodObject<{
  [K in Extract<keyof T, string>]: ZodSchemaOf<T[K]>
}>

type ZodOptionalOf<T> = T extends [infer U]
  ? z.ZodOptional<z.ZodNullable<ZodSchemaOf<U>>>
  : never

type ZodCommonTypeOf<T> = T extends string
  ? z.ZodString | z.ZodUUID | z.ZodEmail
  : T extends bigint
    ? z.ZodString
    : T extends number
      ? z.ZodNumber
      : T extends boolean
        ? z.ZodBoolean
        : z.ZodType<T>

// ──────────────────────────────
// The Main ToZodSchema Utility
// ──────────────────────────────
export type ZodSchemaOf<T> =
  IsOptionalType<T> extends true
    ? ZodOptionalOf<T>
    : IsBlobType<T> extends true
      ? z.ZodType<Uint8Array, Uint8Array>
      : IsCandidVariant<T> extends true
        ? ZodVariantOf<T>
        : T extends (infer U)[]
          ? z.ZodArray<ZodSchemaOf<U>>
          : T extends null
            ? z.ZodNull
            : T extends Principal
              ? z.ZodString
              : T extends object
                ? ZodObjectOf<T>
                : ZodCommonTypeOf<T>

export interface MethodZodSchema<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  functionType: FunctionType
  functionName: Name
  inputSchema: z.ZodTuple
  outputSchema: z.ZodTuple
}

export type ServiceZodSchema<A = BaseActor> = {
  [K in FunctionName<A>]: MethodZodSchema<A, K>
}
