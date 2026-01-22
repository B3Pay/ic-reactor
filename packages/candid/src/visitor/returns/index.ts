import {
  isQuery,
  isBtcAddress,
  isEthAddress,
  isAccountIdentifier,
  isIsoDate,
  isCanisterId,
  isUuid,
  isUrl,
  isImage,
} from "../helpers"
import { TAMESTAMP_KEYS_REGEX, CYCLE_KEYS_REGEX } from "../constants"
import type {
  ResultField,
  NumberFormat,
  TextFormat,
  VariantResultField,
  PrincipalResultField,
  NumberResultField,
  TextResultField,
  BooleanResultField,
  NullResultField,
  BlobResultField,
  OptionalResultField,
  VectorResultField,
  TupleResultField,
  RecursiveResultField,
  UnknownResultField,
  LargeBlobResultField,
} from "./types"
import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import { IDL } from "../types"
import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex } from "@noble/hashes/utils"

/**
 * Service-level result fields mapping
 */
export type ServiceResultFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodResultMeta<A>
}

/**
 * Method-level metadata including result fields
 */
export interface MethodResultMeta<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  resultFields: ResultField[]
  returnCount: number
}

interface Context<V = unknown> {
  label?: string
  value?: V
}

/**
 * A lean visitor for generating result field metadata.
 * Optimized for display rendering - no form-specific metadata.
 *
 * IMPORTANT: This visitor is designed to work with CandidDisplayReactor's
 * transformed values where:
 * - opt T → T | null (not [T] or [])
 * - Principal → string
 * - nat/int/nat64/int64 → string
 * - blob → string (base64/hex)
 * - Result variants (Ok/Err) may be pre-unwrapped at the retType level
 */
export class VisitResultField<A = BaseActor, V = unknown> extends IDL.Visitor<
  Context<V>,
  ResultField | MethodResultMeta<A> | ServiceResultFields<A>
> {
  private getNumberFormat(label?: string): NumberFormat {
    if (!label) return "normal"
    if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
    if (CYCLE_KEYS_REGEX.test(label)) return "cycle"
    return "normal"
  }

  private getTextFormat(label?: string, value?: unknown): TextFormat {
    if (typeof value === "string") {
      if (isImage(value)) return "plain"
      if (isBtcAddress(value)) return "btc"
      if (isEthAddress(value)) return "eth"
      if (isAccountIdentifier(value)) return "account-id"
      if (isUuid(value)) return "uuid"
      if (isIsoDate(value)) return "timestamp"
      if (isCanisterId(value)) return "principal"
      if (isUrl(value)) return "url"
    }

    if (!label) return "plain"
    if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
    if (/email|mail/i.test(label)) return "email"
    if (/phone|tel|mobile/i.test(label)) return "phone"
    if (/url|link|website/i.test(label)) return "url"
    if (/uuid|guid/i.test(label)) return "uuid"
    if (/bitcoin|btc/i.test(label)) return "btc"
    if (/ethereum|eth/i.test(label)) return "eth"
    if (
      /account_id|account_identifier|ledger_account|block_hash|transaction_hash|tx_hash/i.test(
        label as string
      )
    )
      return "account-id"
    if (/canister|principal/i.test(label as string)) return "principal"
    return "plain"
  }

  // Helpers for blob handling: compute byte length from common buffer shapes
  private getBlobByteLength(value?: unknown): number {
    if (!value) return 0
    if (value instanceof Uint8Array) return value.length
    if (Array.isArray(value)) return value.length
    if (value instanceof ArrayBuffer) return value.byteLength
    const maybe = value as { length?: number }
    if (typeof maybe.length === "number") return maybe.length
    return 0
  }

  public visitType<T>(
    _t: IDL.Type<T>,
    context: Context<V>
  ): UnknownResultField {
    return {
      type: "unknown",
      label: context.label ?? "",
      value: context.value,
      displayHint: "none",
    }
  }

  public visitNull(_t: IDL.NullClass, context: Context<V>): NullResultField {
    return {
      type: "null",
      label: context.label ?? "",
      value: context.value,
      displayHint: "none",
    }
  }

  public visitBool(_t: IDL.BoolClass, context: Context<V>): BooleanResultField {
    return {
      type: "boolean",
      label: context.label ?? "",
      value: context.value,
      displayHint: "none",
    }
  }

  public visitInt(_t: IDL.IntClass, context: Context<V>): NumberResultField {
    return {
      type: "number",
      label: context.label ?? "",
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "int",
      displayHint: "none",
    }
  }

  public visitNat(_t: IDL.NatClass, context: Context<V>): NumberResultField {
    return {
      type: "number",
      label: context.label ?? "",
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "nat",
      displayHint: "none",
    }
  }

  public visitFloat(
    _t: IDL.FloatClass,
    context: Context<V>
  ): NumberResultField {
    return {
      type: "number",
      label: context.label ?? "",
      value: context.value,
      numberFormat: "value",
      candidType: "float",
      displayHint: "none",
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    context: Context<V>
  ): PrincipalResultField {
    return {
      type: "principal",
      label: context.label ?? "",
      value: context.value,
      displayHint: "truncate",
      checkIsCanisterId: (v) => isCanisterId(v as string),
    }
  }

  public visitText(_t: IDL.TextClass, context: Context<V>): TextResultField {
    return {
      type: "text",
      label: context.label ?? "",
      value: context.value,
      textFormat: this.getTextFormat(context.label, context.value),
      displayHint: "none",
    }
  }

  public visitBlob(
    _t: IDL.VecClass<number>,
    context: Context<V>
  ): BlobResultField | LargeBlobResultField {
    const val = context.value

    if (typeof val === "string") {
      return {
        type: "blob",
        label: context.label ?? "",
        value: val,
        displayHint: "hex",
      }
    }

    const byteLength = this.getBlobByteLength(val)

    const normalizedValue: string | Uint8Array | number[] | undefined = (() => {
      if (val == null) return undefined
      if (val instanceof Uint8Array) return val
      if (val instanceof ArrayBuffer) return new Uint8Array(val)
      if (Array.isArray(val) && val.every((n) => typeof n === "number"))
        return val as number[]
      return undefined
    })()

    const hashInput: Uint8Array = ((): Uint8Array => {
      if (typeof normalizedValue === "string")
        return new TextEncoder().encode(normalizedValue)
      if (normalizedValue instanceof Uint8Array) return normalizedValue
      if (Array.isArray(normalizedValue)) return new Uint8Array(normalizedValue)
      return new Uint8Array()
    })()

    return {
      type: "blob-large",
      label: context.label ?? "",
      value: {
        length: byteLength,
        hash: bytesToHex(sha256(hashInput)),
        value: normalizedValue,
      },
      displayHint: "hex",
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    context: Context<V>
  ): OptionalResultField {
    // CandidDisplayReactor transforms opt T → T | null
    // So context.value is either the unwrapped value or null (not [value] or [])
    const hasValue = context.value !== null && context.value !== undefined

    const innerField = ty.accept(this, {
      label: "optional-inner",
      value: hasValue ? context.value : undefined,
    }) as ResultField

    return {
      type: "optional",
      label: context.label ?? "",
      value: context.value,
      innerField,
      displayHint: "none",
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: [string, IDL.Type<any>][],
    context: Context<V>
  ): ResultField {
    const resultFields = fields.map(
      ([key, type]) =>
        type.accept(this, {
          label: key,
          value: (context.value as Record<string, any>)?.[key],
        }) as ResultField
    ) as ResultField[]

    return {
      type: "record",
      label: context.label ?? "",
      value: context.value,
      fields: resultFields,
      displayHint: resultFields.length > 5 ? "truncate" : "none",
    }
  }

  public visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type<any>[],
    context: Context<V>
  ): TupleResultField {
    const fields = components.map(
      (type, index) =>
        type.accept(this, {
          label: `_${index}`,
          value: (context.value as any[])?.[index],
        }) as ResultField
    ) as ResultField[]

    return {
      type: "tuple",
      label: context.label ?? "",
      value: context.value,
      fields,
      displayHint: "none",
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: [string, IDL.Type<any>][],
    context: Context<V>
  ): VariantResultField | ResultField {
    const options = fields.map(([key]) => key)
    const optionFields = fields.map(
      ([key, type]) =>
        type.accept(this, {
          label: key,
          value: (context.value as Record<string, any>)?.[key],
        }) as ResultField
    ) as ResultField[]

    return {
      type: "variant",
      label: context.label ?? "",
      value: context.value,
      options,
      optionFields,
      displayHint: "none",
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    context: Context<V>
  ): VectorResultField | BlobResultField | LargeBlobResultField {
    // Check if it's blob by type
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return this.visitBlob(_t as IDL.VecClass<number>, context)
    }

    const itemField = ty.accept(this, {
      label: "item",
      value: undefined, // Intentionally undefined; per-item values may be added below
    }) as ResultField

    // If the vector value is an array, create per-item fields with their values
    const items = Array.isArray(context.value)
      ? (context.value as any[]).map(
          (entry) =>
            ty.accept(this, { label: "item", value: entry }) as ResultField
        )
      : undefined

    return {
      type: "vector",
      label: context.label ?? "",
      value: context.value,
      itemField,
      items,
      displayHint: "none",
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    context: Context<V>
  ): RecursiveResultField {
    if (!ty) {
      throw new Error("Recursive type undefined")
    }

    // Use lazy extraction to prevent infinite recursion during visitor traversal
    // The extract function is called at render time with the actual value
    return {
      type: "recursive",
      label: context.label ?? "",
      value: context.value,
      typeName: t.name,
      extract: ((value?: any) =>
        ty.accept(this, {
          label: context.label ?? "",
          value: value !== undefined ? (value as V) : context.value,
        }) as ResultField) as (value?: unknown) => ResultField,
      displayHint: "none",
    }
  }

  public visitFunc(t: IDL.FuncClass, context: Context<V>): MethodResultMeta<A> {
    const functionName = context.label as FunctionName<A>

    // context.value is the array of returns if present
    const resultFields = t.retTypes.map(
      (retType, index) =>
        retType.accept(this, {
          label: `__ret${index}`,
          value: (context.value as any[])?.[index],
        }) as ResultField
    ) as ResultField[]

    return {
      functionName,
      functionType: isQuery(t) ? "query" : "update",
      resultFields,
      returnCount: t.retTypes.length,
    }
  }

  public visitService(t: IDL.ServiceClass): ServiceResultFields<A> {
    const methodFields = t._fields.reduce((acc, [functionName, func]) => {
      acc[functionName as FunctionName<A>] = func.accept(this, {
        label: functionName as unknown as string,
      }) as MethodResultMeta<A>

      return acc
    }, {} as ServiceResultFields<A>)

    return methodFields
  }

  public visitFixedInt(
    _t: IDL.FixedIntClass,
    context: Context<V>
  ): NumberResultField {
    return {
      type: "number",
      label: context.label ?? "",
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "int",
      displayHint: "none",
    }
  }

  public visitFixedNat(
    _t: IDL.FixedNatClass,
    context: Context<V>
  ): NumberResultField {
    return {
      type: "number",
      label: context.label ?? "",
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "nat",
      displayHint: "none",
    }
  }
}
