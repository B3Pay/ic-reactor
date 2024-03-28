import { IDL } from "@dfinity/candid"
import type {
  MethodResult,
  DynamicDataArgs,
  NormalMethodResult,
  RecordMethodResult,
  TupleMethodResult,
  VectorMethodResult,
  NumberMethodResult,
  TextMethodResult,
  BooleanMethodResult,
  UnknownMethodResult,
  PrincipalMethodResult,
  OptionalMethodResult,
  VariantMethodResult,
} from "./types"
import { isImage, isUrl } from "../helper"
import type { Principal } from "@ic-reactor/core/dist/types"
import { TAMESTAMP_KEYS_REGEX, VALUE_KEYS_REGEX } from "../constants"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitTransform extends IDL.Visitor<DynamicDataArgs, MethodResult> {
  public visitFunc(
    t: IDL.FuncClass,
    { label, value }: DynamicDataArgs
  ): NormalMethodResult {
    const dataValues = t.retTypes.length === 1 ? [value] : (value as unknown[])

    const values = t.retTypes.reduce((acc, type, index) => {
      const value = type.accept(this, {
        value: dataValues[index],
      })

      acc[`ret${index}`] = value

      return acc
    }, {} as Record<`ret${number}`, MethodResult>)

    return {
      values,
      label,
      type: "normal",
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: DynamicDataArgs<T>
  ): MethodResult {
    return ty.accept(this, data)
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[] | null>
  ): OptionalMethodResult {
    if (value?.length === 1) {
      return {
        label,
        type: "optional",
        value: ty.accept(this, { value: value[0], label }),
      }
    }

    return {
      value: null,
      label,
      type: "optional",
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: DynamicDataArgs<Record<string, unknown>>
  ): RecordMethodResult {
    const values = fields.reduce((acc, [key, type]) => {
      if (value[key] === undefined) {
        return acc
      }

      const field = type.accept(this, {
        label: key,
        value: value[key],
      })

      acc[key] = field

      return acc
    }, {} as Record<string, MethodResult>)

    return {
      label,
      type: "record",
      values,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: DynamicDataArgs<unknown[]>
  ): TupleMethodResult {
    // If the tuple has only two elements, we can assume it's a key-value pair
    if (value.length === 2) {
      const keyResult = components[0].accept(this, {
        value: value[0],
      })

      const keyTypes = ["principal", "text", "variant"]

      if (keyTypes.includes(keyResult.type)) {
        const valueResult = components[1].accept(this, {
          value: value[1],
        })
        const valueTypes = ["principal", "text", "variant", "number", "boolean"]

        const isKeyValue =
          valueTypes.includes(valueResult.type) ||
          (keyResult.type === "vector" && keyResult.componentType === "blob")

        return {
          label,
          key: keyResult,
          value: valueResult,
          type: "tuple",
          componentType: isKeyValue ? "keyValue" : "record",
        }
      }
    }

    const values = components.map((type, index) =>
      type.accept(this, { label, value: value[index] })
    )

    return {
      label,
      values,
      type: "tuple",
      componentType: "normal",
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: DynamicDataArgs<Record<string, unknown>>
  ): VariantMethodResult | MethodResult {
    // Find the first field that matches and has a value
    for (const [key, type] of fields) {
      if (value[key] !== undefined) {
        return value[key] === null
          ? {
              label,
              type: "variant",
              variant: key,
            }
          : type.accept(this, {
              label: key,
              value: value[key],
            })
      }
    }

    return {
      label,
      type: "variant",
      variant: "unknown",
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[]>
  ): VectorMethodResult {
    if ("_bits" in ty && ty._bits === 8) {
      return {
        label,
        value: t.encodeValue(value),
        type: "vector",
        componentType: "blob",
      }
    }

    const values = value.map((value) => {
      return ty.accept(this, {
        value,
      })
    })

    if (ty instanceof IDL.RecordClass && values?.length > 5) {
      const labelList = Object.keys(
        (values as Array<RecordMethodResult>)[0].values
      )
      return {
        label,
        labelList,
        values: values as Array<RecordMethodResult>,
        type: "vector",
        componentType: "list",
      }
    }

    return {
      label,
      values,
      type: "vector",
      componentType: "normal",
    }
  }

  public visitText(
    _t: IDL.TextClass,
    { value, label }: DynamicDataArgs<string>
  ): TextMethodResult {
    const isurl = isUrl(value)
    const isImg = isImage(value)

    return {
      label,
      value,
      type: "text",
      componentType: isImg ? "image" : isurl ? "url" : "normal",
    }
  }

  public visitNumber<T>(
    _t: IDL.Type<T>,
    { value, label }: DynamicDataArgs<number | bigint>
  ): NumberMethodResult {
    const isBigInt = typeof value === "bigint"
    const componentType = isBigInt
      ? label
        ? TAMESTAMP_KEYS_REGEX.test(label)
          ? "timestamp"
          : VALUE_KEYS_REGEX.test(label)
          ? "value"
          : label === "cycle"
          ? "cycle"
          : "bigInt"
        : "normal"
      : "normal"

    return {
      label,
      value,
      type: "number",
      componentType,
    } as NumberMethodResult
  }

  public visitInt(
    t: IDL.IntClass,
    data: DynamicDataArgs<number>
  ): NumberMethodResult {
    return this.visitNumber(t, data)
  }

  public visitNat(
    t: IDL.NatClass,
    data: DynamicDataArgs<number>
  ): NumberMethodResult {
    return this.visitNumber(t, data)
  }

  public visitFloat(
    t: IDL.FloatClass,
    data: DynamicDataArgs<number>
  ): NumberMethodResult {
    return this.visitNumber(t, data)
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    data: DynamicDataArgs<number>
  ): NumberMethodResult {
    return this.visitNumber(t, data)
  }

  public visitFixedNat(
    t: IDL.FixedNatClass,
    data: DynamicDataArgs<number>
  ): NumberMethodResult {
    return this.visitNumber(t, data)
  }

  public visitPrimitive<T>(
    t: IDL.PrimitiveType<T>,
    data: DynamicDataArgs<unknown>
  ): MethodResult {
    return this.visitType(t, data)
  }

  public visitNull(
    _t: IDL.NullClass,
    { value, label }: DynamicDataArgs<string>
  ): TextMethodResult {
    return {
      label,
      value,
      type: "text",
      componentType: "null",
    }
  }

  public visitBool(
    _t: IDL.BoolClass,
    { value, label }: DynamicDataArgs<boolean>
  ): BooleanMethodResult {
    return {
      label,
      value,
      type: "boolean",
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    { value, label }: DynamicDataArgs<Principal>
  ): PrincipalMethodResult {
    return {
      label,
      value,
      type: "principal",
    }
  }

  public visitType<T>(
    t: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T>
  ): UnknownMethodResult {
    return {
      label,
      value: t.valueToString(value),
      type: "unknown",
    }
  }
}
