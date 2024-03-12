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
} from "../types"
import { isImage, isUrl } from "../../helper"
import type { Principal } from "@ic-reactor/core/dist/types"
import { TAMESTAMP_KEYS } from "../../constants"

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
      label: label ?? t.name,
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
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[] | null>
  ): OptionalMethodResult {
    if (value?.length === 1) {
      return {
        label: label ?? t.name,
        type: "optional",
        value: ty.accept(this, { value: value[0], label }),
      }
    }

    return {
      value: null,
      label: label ?? t.name,
      type: "optional",
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
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
      label: label ?? t.name,
      type: "record",
      values,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: DynamicDataArgs<unknown[]>
  ): TupleMethodResult | RecordMethodResult {
    if (value.length === 2) {
      const compResult = components[0].accept(this, {
        value: value[0],
      }) as TextMethodResult | PrincipalMethodResult

      const textValue = compResult.value?.toString()
      const textLabel = compResult.label
        ? `${compResult.label}.${textValue}`
        : textValue

      if (textValue) {
        return this.visitRecord(t, [[textValue, components[1]]], {
          value: { [textValue]: value[1] },
          label: textLabel,
        })
      }
    }

    const values = components.map((type, index) =>
      type.accept(this, { label, value: value[index] })
    )

    return {
      label: label ?? t.name,
      values,
      type: "tuple",
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: DynamicDataArgs<Record<string, unknown>>
  ): MethodResult {
    // Find the first field that matches and has a value
    for (const [key, type] of fields) {
      if (value[key] !== undefined) {
        return type.accept(this, {
          label: label ?? key,
          value: value[key] === null ? key : value[key],
        })
      }
    }

    return {
      label: label ?? t.name,
      value: "No matching variant",
      type: "unknown",
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[]>
  ): VectorMethodResult {
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return {
        label: label ?? t.name,
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

    return {
      label: label ?? t.name,
      values,
      type: "vector",
      componentType: "normal",
    }
  }

  public visitText(
    t: IDL.TextClass,
    { value, label }: DynamicDataArgs<string>
  ): TextMethodResult {
    const isurl = isUrl(value)
    const isImg = isImage(value)

    return {
      label: label ?? t.name,
      value,
      type: "text",
      componentType: isImg ? "image" : isurl ? "url" : "normal",
    }
  }

  public visitNumber<T>(
    t: IDL.Type<T>,
    { value, label }: DynamicDataArgs<number | bigint>
  ): NumberMethodResult {
    const isBigInt = typeof value === "bigint"
    const componentType = isBigInt
      ? label
        ? TAMESTAMP_KEYS.includes(label)
          ? "timestamp"
          : label === "cycle"
          ? "cycle"
          : "bigInt"
        : "normal"
      : "normal"

    return {
      label: label ?? t.name,
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
    t: IDL.NullClass,
    { value, label }: DynamicDataArgs<string>
  ): TextMethodResult {
    return {
      label: label ?? t.name,
      value,
      type: "text",
      componentType: "null",
    }
  }

  public visitBool(
    t: IDL.BoolClass,
    { value, label }: DynamicDataArgs<boolean>
  ): BooleanMethodResult {
    return {
      label: label ?? t.name,
      value,
      type: "boolean",
    }
  }

  public visitPrincipal(
    t: IDL.PrincipalClass,
    { value, label }: DynamicDataArgs<Principal>
  ): PrincipalMethodResult {
    return {
      label: label ?? t.name,
      value,
      type: "principal",
    }
  }

  public visitType<T>(
    t: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T>
  ): UnknownMethodResult {
    return {
      label: label ?? t.name,
      value: t.valueToString(value),
      type: "unknown",
    }
  }
}
