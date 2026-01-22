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

interface Context {
  label: string
  value?: any
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
export class VisitResultField<A = BaseActor> extends IDL.Visitor<
  Context,
  ResultField | MethodResultMeta<A> | ServiceResultFields<A>
> {
  private getNumberFormat(label: string): NumberFormat {
    if (!label) return "normal"
    if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
    if (CYCLE_KEYS_REGEX.test(label)) return "cycle"
    return "normal"
  }

  private getTextFormat(label: string, value?: any): TextFormat {
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
        label
      )
    )
      return "account-id"
    if (/canister|principal/i.test(label)) return "principal"
    return "plain"
  }

  // Helpers for blob handling: compute byte length, convert to Uint8Array, and compute a small crc32 hash
  private getBlobByteLength(value?: any): number {
    if (!value) return 0
    if (value instanceof Uint8Array) return value.length
    return 0
  }

  public visitType<T>(_t: IDL.Type<T>, context: Context): UnknownResultField {
    return {
      type: "unknown",
      label: context.label,
      value: context.value,
      displayHint: "none",
    }
  }

  public visitNull(_t: IDL.NullClass, context: Context): NullResultField {
    return {
      type: "null",
      label: context.label,
      value: context.value,
      displayHint: "none",
    }
  }

  public visitBool(_t: IDL.BoolClass, context: Context): BooleanResultField {
    return {
      type: "boolean",
      label: context.label,
      value: context.value,
      displayHint: "none",
    }
  }

  public visitInt(_t: IDL.IntClass, context: Context): NumberResultField {
    return {
      type: "number",
      label: context.label,
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "int",
      displayHint: "none",
    }
  }

  public visitNat(_t: IDL.NatClass, context: Context): NumberResultField {
    return {
      type: "number",
      label: context.label,
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "nat",
      displayHint: "none",
    }
  }

  public visitFloat(_t: IDL.FloatClass, context: Context): NumberResultField {
    return {
      type: "number",
      label: context.label,
      value: context.value,
      numberFormat: "value",
      candidType: "float",
      displayHint: "none",
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    context: Context
  ): PrincipalResultField {
    return {
      type: "principal",
      label: context.label,
      value: context.value,
      displayHint: "truncate",
      checkIsCanisterId: (v) => isCanisterId(v as string),
    }
  }

  public visitText(_t: IDL.TextClass, context: Context): TextResultField {
    return {
      type: "text",
      label: context.label,
      value: context.value,
      textFormat: this.getTextFormat(context.label, context.value),
      displayHint: "none",
    }
  }

  public visitBlob(
    _t: IDL.VecClass<number>,
    context: Context
  ): BlobResultField | LargeBlobResultField {
    if (typeof context.value === "string") {
      return {
        type: "blob",
        label: context.label,
        value: context.value,
        displayHint: "hex",
      }
    }

    const byteLength = this.getBlobByteLength(context.value)

    return {
      type: "blob-large",
      label: context.label,
      value: {
        length: byteLength,
        hash: bytesToHex(sha256(context.value)),
        value: context.value,
      },
      displayHint: "hex",
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    context: Context
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
      label: context.label,
      value: context.value,
      innerField,
      displayHint: "none",
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: [string, IDL.Type<any>][],
    context: Context
  ): ResultField {
    const resultFields = fields.map(([key, type]) =>
      type.accept(this, { label: key, value: context.value?.[key] })
    ) as ResultField[]

    return {
      type: "record",
      label: context.label,
      value: context.value,
      fields: resultFields,
      displayHint: resultFields.length > 5 ? "truncate" : "none",
    }
  }

  public visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type<any>[],
    context: Context
  ): TupleResultField {
    const fields = components.map((type, index) =>
      type.accept(this, { label: `_${index}`, value: context.value?.[index] })
    ) as ResultField[]

    return {
      type: "tuple",
      label: context.label,
      value: context.value,
      fields,
      displayHint: "none",
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: [string, IDL.Type<any>][],
    context: Context
  ): VariantResultField | ResultField {
    const options = fields.map(([key]) => key)
    const optionFields = fields.map(([key, type]) =>
      type.accept(this, { label: key, value: context.value?.[key] })
    ) as ResultField[]

    return {
      type: "variant",
      label: context.label,
      value: context.value,
      options,
      optionFields,
      displayHint: "none",
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    context: Context
  ): VectorResultField | BlobResultField | LargeBlobResultField {
    console.log("🚀 ~ VisitResultField ~ visitVec ~ ty:", ty)
    console.log("🚀 ~ VisitResultField ~ visitVec ~ context:", context)
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
    console.log("🚀 ~ VisitResultField ~ visitVec ~ items:", items)

    return {
      type: "vector",
      label: context.label,
      value: context.value,
      itemField,
      items,
      displayHint: "none",
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    context: Context
  ): RecursiveResultField {
    if (!ty) {
      throw new Error("Recursive type undefined")
    }

    // Use lazy extraction to prevent infinite recursion during visitor traversal
    // The extract function is called at render time with the actual value
    return {
      type: "recursive",
      label: context.label,
      value: context.value,
      typeName: t.name,
      extract: (value?: unknown) =>
        ty.accept(this, {
          label: context.label,
          value: value !== undefined ? value : context.value,
        }) as ResultField,
      displayHint: "none",
    }
  }

  public visitFunc(t: IDL.FuncClass, context: Context): MethodResultMeta<A> {
    const functionName = context.label as FunctionName<A>

    // context.value is the array of returns if present
    const resultFields = t.retTypes.map((retType, index) =>
      retType.accept(this, {
        label: `__ret${index}`,
        value: context.value?.[index],
      })
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
        label: functionName,
      }) as MethodResultMeta<A>

      return acc
    }, {} as ServiceResultFields<A>)

    return methodFields
  }

  public visitFixedInt(
    _t: IDL.FixedIntClass,
    context: Context
  ): NumberResultField {
    return {
      type: "number",
      label: context.label,
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "int",
      displayHint: "none",
    }
  }

  public visitFixedNat(
    _t: IDL.FixedNatClass,
    context: Context
  ): NumberResultField {
    return {
      type: "number",
      label: context.label,
      value: context.value,
      numberFormat: this.getNumberFormat(context.label),
      candidType: "nat",
      displayHint: "none",
    }
  }
}
