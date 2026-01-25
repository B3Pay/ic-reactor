import { isQuery } from "../helpers"
import { checkTextFormat, checkNumberFormat } from "../constants"
import { IDL } from "../types"
import type {
  ResultField,
  ResultFieldWithValue,
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
  ResolvedMethodResult,
} from "./types"
import { DisplayCodecVisitor } from "@ic-reactor/core"
import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core"

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
 * 5. **Resolvable** - metadata can be combined with values at runtime via .resolve(val)
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
  private displayVisitor = new DisplayCodecVisitor()

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
    functionName: FunctionName<A>
  ): MethodResultMeta<A> {
    const functionType: FunctionType = isQuery(t) ? "query" : "update"

    const resultFields = t.retTypes.map((retType, index) =>
      retType.accept(this, `__ret${index}`)
    ) as ResultField[]

    const generateMetadata = (
      data: ActorMethodReturnType<A[FunctionName<A>]>
    ): ResolvedMethodResult<A> => {
      const dataArray: unknown[] =
        resultFields.length === 0
          ? []
          : resultFields.length === 1
            ? [data]
            : (data as unknown[])

      const results = resultFields.map((field, index) =>
        field.resolve(dataArray[index])
      )

      return {
        functionType,
        functionName,
        results,
        raw: data,
      }
    }

    return {
      functionType,
      functionName,
      resultFields,
      returnCount: t.retTypes.length,
      generateMetadata,
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

    const field: RecordResultField = {
      type: "record",
      label,
      candidType: "record",
      displayType: "object",
      fields,
      resolve(value: unknown): ResultFieldWithValue {
        const record = value as Record<string, unknown> | null | undefined
        if (record == null) {
          return { field, value: null, raw: value }
        }

        const resolvedFields: Record<string, ResultFieldWithValue> = {}
        for (const f of fields) {
          resolvedFields[f.label] = f.resolve(record[f.label])
        }

        return { field, value: resolvedFields, raw: value }
      },
    }
    return field
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

    // Detect if this is a Result type (has Ok and Err options)
    const isResult = options.includes("Ok") && options.includes("Err")
    const displayType = isResult ? "result" : "variant"

    const field: VariantResultField = {
      type: "variant",
      label,
      candidType: "variant",
      displayType,
      options,
      optionFields,
      resolve(value: unknown): ResultFieldWithValue {
        if (value == null) {
          return { field, value: null, raw: value }
        }

        const variant = value as Record<string, unknown>
        const optionsInValue = Object.keys(variant)
        const activeOption = optionsInValue.find((opt) => options.includes(opt))

        if (!activeOption) {
          return { field, value: null, raw: value }
        }

        const activeValue = variant[activeOption]
        const optionIndex = options.indexOf(activeOption)
        const optionField = optionFields[optionIndex]

        const specificField: VariantResultField = {
          ...field,
          options,
          optionFields: [optionField],
        }

        return {
          field: specificField,
          value: {
            option: activeOption,
            value: optionField?.resolve(activeValue) ?? {
              field: optionField,
              value: activeValue,
              raw: activeValue,
            },
          },
          raw: value,
        }
      },
    }

    return field
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleResultField {
    const fields = components.map(
      (type, index) => type.accept(this, `_${index}`) as ResultField
    )

    const field: TupleResultField = {
      type: "tuple",
      label,
      candidType: "tuple",
      displayType: "array",
      fields,
      resolve(value: unknown): ResultFieldWithValue {
        const tuple = value as unknown[] | null | undefined
        if (tuple == null) {
          return { field, value: null, raw: value }
        }

        const resolvedItems = fields.map((f, index) => f.resolve(tuple[index]))
        return { field, value: resolvedItems, raw: value }
      },
    }

    return field
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalResultField {
    const innerField = ty.accept(this, label) as ResultField

    const field: OptionalResultField = {
      type: "optional",
      label,
      candidType: "opt",
      displayType: "nullable",
      innerField,
      resolve(value: unknown): ResultFieldWithValue {
        const opt = value as [unknown] | [] | null | undefined
        if (opt == null || opt.length === 0) {
          return { field, value: null, raw: value }
        }
        return { field, value: innerField.resolve(opt[0]), raw: value }
      },
    }

    return field
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): VectorResultField | BlobResultField {
    // Check if it's blob (vec nat8)
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      const codec = _t.accept(this.displayVisitor, null) as any
      const blobField: BlobResultField = {
        type: "blob",
        label,
        candidType: "blob",
        displayType: "string", // Transformed to hex string
        displayHint: "hex",
        resolve(value: unknown): ResultFieldWithValue {
          return {
            field: blobField,
            value: codec.decode(value),
            raw: value,
          }
        },
      }
      return blobField
    }

    const itemField = ty.accept(this, "item") as ResultField

    const field: VectorResultField = {
      type: "vector",
      label,
      candidType: "vec",
      displayType: "array",
      itemField,
      resolve(value: unknown): ResultFieldWithValue {
        const vec = value as unknown[] | null | undefined
        if (vec == null) {
          return { field, value: null, raw: value }
        }

        const resolvedItems = vec.map((item) => itemField.resolve(item))
        return { field, value: resolvedItems, raw: value }
      },
    }

    return field
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): RecursiveResultField {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    const field: RecursiveResultField = {
      type: "recursive",
      label,
      candidType: "rec",
      displayType: "recursive",
      typeName: t.name,
      // Lazy extraction to prevent infinite loops
      extract: () => ty.accept(self, label) as ResultField,
      resolve(value: unknown): ResultFieldWithValue {
        // Extract the inner field and resolve with it
        const innerField = field.extract()
        return innerField.resolve(value)
      },
    }

    return field
  }

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  public visitPrincipal(
    t: IDL.PrincipalClass,
    label: string
  ): PrincipalResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: PrincipalResultField = {
      type: "principal",
      label,
      candidType: "principal",
      displayType: "string", // Principal.toText()
      textFormat: checkTextFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return {
          field,
          value: codec.decode(value),
          raw: value,
        }
      },
    }

    return field
  }

  public visitText(t: IDL.TextClass, label: string): TextResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: TextResultField = {
      type: "text",
      label,
      candidType: "text",
      displayType: "string",
      textFormat: checkTextFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value: codec.decode(value), raw: value }
      },
    }

    return field
  }

  public visitBool(t: IDL.BoolClass, label: string): BooleanResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: BooleanResultField = {
      type: "boolean",
      label,
      candidType: "bool",
      displayType: "boolean",
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value: codec.decode(value), raw: value }
      },
    }

    return field
  }

  public visitNull(t: IDL.NullClass, label: string): NullResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: NullResultField = {
      type: "null",
      label,
      candidType: "null",
      displayType: "null",
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value: codec.decode(value), raw: value }
      },
    }

    return field
  }

  // Numbers
  public visitInt(t: IDL.IntClass, label: string): NumberResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: NumberResultField = {
      type: "number",
      label,
      candidType: "int",
      displayType: "string", // BigInt → string
      numberFormat: checkNumberFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value: codec.decode(value), raw: value }
      },
    }

    return field
  }

  public visitNat(t: IDL.NatClass, label: string): NumberResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: NumberResultField = {
      type: "number",
      label,
      candidType: "nat",
      displayType: "string", // BigInt → string
      numberFormat: checkNumberFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value: codec.decode(value), raw: value }
      },
    }

    return field
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberResultField {
    const codec = t.accept(this.displayVisitor, null) as any
    const field: NumberResultField = {
      type: "number",
      label,
      candidType: `float${t._bits}`,
      displayType: "number", // Floats stay as numbers
      numberFormat: checkNumberFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value: codec.decode(value), raw: value }
      },
    }

    return field
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): NumberResultField {
    const bits = t._bits
    const codec = t.accept(this.displayVisitor, null) as any
    const field: NumberResultField = {
      type: "number",
      label,
      candidType: `int${bits}`,
      displayType: bits <= 32 ? "number" : "string", // int64 → string
      numberFormat: checkNumberFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return {
          field,
          value: codec.decode(value),
          raw: value,
        }
      },
    }

    return field
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): NumberResultField {
    const bits = t._bits
    const codec = t.accept(this.displayVisitor, null) as any
    const field: NumberResultField = {
      type: "number",
      label,
      candidType: `nat${bits}`,
      displayType: bits <= 32 ? "number" : "string", // nat64 → string
      numberFormat: checkNumberFormat(label),
      resolve(value: unknown): ResultFieldWithValue {
        return {
          field,
          value: codec.decode(value),
          raw: value,
        }
      },
    }

    return field
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): UnknownResultField {
    const field: UnknownResultField = {
      type: "unknown",
      label,
      candidType: "unknown",
      displayType: "unknown",
      resolve(value: unknown): ResultFieldWithValue {
        return { field, value, raw: value }
      },
    }

    return field
  }
}
