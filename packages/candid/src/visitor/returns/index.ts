import { isQuery } from "../helpers"
import { TAMESTAMP_KEYS_REGEX, CYCLE_KEYS_REGEX } from "../constants"
import { IDL } from "../types"
import type {
  ResultField,
  NumberFormat,
  TextFormat,
  RecordResultField,
  VariantResultField,
  TupleResultField,
  OptionalResultField,
  VectorResultField,
  BlobResultField,
  RecursiveResultField,
  PrincipalResultField,
  NumberResultField,
  TextResultField,
  BooleanResultField,
  NullResultField,
  UnknownResultField,
  MethodResultMeta,
  ServiceResultMeta,
} from "./types"
import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"

export * from "./types"

/**
 * ResultFieldVisitor generates metadata for displaying method results from Candid IDL types.
 *
 * ## Design Principles
 *
 * 1. **Works with raw IDL types BEFORE transformation** - generates metadata at initialization
 * 2. **No value dependencies** - metadata describes structure, not specific values
 * 3. **Describes display format** - includes hints for how values will appear after transformation
 * 4. **Efficient** - single traversal, reusable metadata
 *
 * ## Key Insight: Metadata vs Values
 *
 * The visitor generates a "schema" that describes:
 * - What type each field is in Candid (nat, Principal, opt, etc.)
 * - What it becomes after display transformation (string, null, etc.)
 * - How it should be formatted (timestamp, cycle, hex, etc.)
 *
 * Values are NOT passed during traversal. Instead, the generated schema
 * is used at render time to properly display transformed values.
 *
 * ## Display Transformations (applied by DisplayCodecVisitor)
 *
 * | Candid Type | Display Type | Notes |
 * |-------------|--------------|-------|
 * | nat, int, nat64, int64 | string | BigInt → string |
 * | Principal | string | Principal.toText() |
 * | opt T | T \| null | [value] → value, [] → null |
 * | vec nat8 (blob) | string | Uint8Array → hex string |
 * | variant { Ok, Err } | unwrapped | { Ok: val } → val (or throws on Err) |
 *
 * @example
 * ```typescript
 * const visitor = new ResultFieldVisitor()
 * const serviceMeta = service.accept(visitor, null)
 *
 * // Get method result metadata
 * const methodMeta = serviceMeta["icrc1_balance_of"]
 * // methodMeta.resultFields[0] = {
 * //   type: "number",
 * //   candidType: "nat",
 * //   displayType: "string",
 * //   numberFormat: "normal"
 * // }
 *
 * // At render time, apply to transformed value:
 * const transformedResult = "1000000000" // Already transformed by DisplayCodec
 * renderField(methodMeta.resultFields[0], transformedResult)
 * ```
 */
export class ResultFieldVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  ResultField | MethodResultMeta<A> | ServiceResultMeta<A>
> {
  // ════════════════════════════════════════════════════════════════════════
  // Format Detection (from label names)
  // ════════════════════════════════════════════════════════════════════════

  private getNumberFormat(label?: string): NumberFormat {
    if (!label) return "normal"
    if (TAMESTAMP_KEYS_REGEX.test(label)) return "timestamp"
    if (CYCLE_KEYS_REGEX.test(label)) return "cycle"
    return "normal"
  }

  private getTextFormat(label?: string): TextFormat {
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
    ) {
      return "account-id"
    }
    if (/canister|principal/i.test(label)) return "principal"
    return "plain"
  }

  // ════════════════════════════════════════════════════════════════════════
  // Service & Function Level
  // ════════════════════════════════════════════════════════════════════════

  public visitService(t: IDL.ServiceClass): ServiceResultMeta<A> {
    const result = {} as ServiceResultMeta<A>

    for (const [functionName, func] of t._fields) {
      result[functionName as FunctionName<A>] = func.accept(
        this,
        functionName
      ) as MethodResultMeta<A>
    }

    return result
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: string
  ): MethodResultMeta<A> {
    const functionType: FunctionType = isQuery(t) ? "query" : "update"

    const resultFields = t.retTypes.map((retType, index) =>
      retType.accept(this, `__ret${index}`)
    ) as ResultField[]

    return {
      functionType,
      functionName: functionName as FunctionName<A>,
      resultFields,
      returnCount: t.retTypes.length,
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ════════════════════════════════════════════════════════════════════════

  public visitRecord(
    _t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): RecordResultField {
    const fields = fields_.map(
      ([key, type]) => type.accept(this, key) as ResultField
    )

    return {
      type: "record",
      label,
      candidType: "record",
      displayType: "object",
      fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): VariantResultField {
    const options: string[] = []
    const optionFields: ResultField[] = []

    for (const [key, type] of fields_) {
      options.push(key)
      optionFields.push(type.accept(this, key) as ResultField)
    }

    // Check if this is a Result type (Ok/Err pattern)
    const isResultType =
      options.length === 2 &&
      ((options.includes("Ok") && options.includes("Err")) ||
        (options.includes("ok") && options.includes("err")))

    return {
      type: "variant",
      label,
      candidType: "variant",
      displayType: isResultType ? "result" : "variant",
      options,
      optionFields,
      isResultType,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleResultField {
    const fields = components.map(
      (type, index) => type.accept(this, `_${index}`) as ResultField
    )

    return {
      type: "tuple",
      label,
      candidType: "tuple",
      displayType: "array",
      fields,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalResultField {
    const innerField = ty.accept(this, label) as ResultField

    return {
      type: "optional",
      label,
      candidType: "opt",
      displayType: "nullable",
      innerField,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): VectorResultField | BlobResultField {
    // Check if it's blob (vec nat8)
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return {
        type: "blob",
        label,
        candidType: "blob",
        displayType: "string", // Transformed to hex string
        displayHint: "hex",
      }
    }

    const itemField = ty.accept(this, "item") as ResultField

    return {
      type: "vector",
      label,
      candidType: "vec",
      displayType: "array",
      itemField,
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): RecursiveResultField {
    return {
      type: "recursive",
      label,
      candidType: "rec",
      displayType: "recursive",
      typeName: t.name,
      // Lazy extraction to prevent infinite loops
      extract: () => ty.accept(this, label) as ResultField,
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    label: string
  ): PrincipalResultField {
    return {
      type: "principal",
      label,
      candidType: "principal",
      displayType: "string", // Principal.toText()
      textFormat: this.getTextFormat(label),
    }
  }

  public visitText(_t: IDL.TextClass, label: string): TextResultField {
    return {
      type: "text",
      label,
      candidType: "text",
      displayType: "string",
      textFormat: this.getTextFormat(label),
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): BooleanResultField {
    return {
      type: "boolean",
      label,
      candidType: "bool",
      displayType: "boolean",
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): NullResultField {
    return {
      type: "null",
      label,
      candidType: "null",
      displayType: "null",
    }
  }

  // Numbers
  public visitInt(_t: IDL.IntClass, label: string): NumberResultField {
    return {
      type: "number",
      label,
      candidType: "int",
      displayType: "string", // BigInt → string
      numberFormat: this.getNumberFormat(label),
    }
  }

  public visitNat(_t: IDL.NatClass, label: string): NumberResultField {
    return {
      type: "number",
      label,
      candidType: "nat",
      displayType: "string", // BigInt → string
      numberFormat: this.getNumberFormat(label),
    }
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberResultField {
    return {
      type: "number",
      label,
      candidType: `float${t._bits}`,
      displayType: "number", // Floats stay as numbers
      numberFormat: this.getNumberFormat(label),
    }
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): NumberResultField {
    const bits = t._bits
    return {
      type: "number",
      label,
      candidType: `int${bits}`,
      displayType: bits <= 32 ? "number" : "string", // int64 → string
      numberFormat: this.getNumberFormat(label),
    }
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): NumberResultField {
    const bits = t._bits
    return {
      type: "number",
      label,
      candidType: `nat${bits}`,
      displayType: bits <= 32 ? "number" : "string", // nat64 → string
      numberFormat: this.getNumberFormat(label),
    }
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): UnknownResultField {
    return {
      type: "unknown",
      label,
      candidType: "unknown",
      displayType: "unknown",
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Legacy Export (for backward compatibility)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use ResultFieldVisitor instead
 */
export { ResultFieldVisitor as VisitResultField }
