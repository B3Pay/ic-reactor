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
    { value, label }: DynamicDataArgs
  ): NormalMethodResult {
    const dataValues = t.retTypes.length === 1 ? [value] : (value as unknown[])

    const values = t.retTypes.map((type, index) => {
      return type.accept(this, {
        label: `ret${index}`,
        value: dataValues[index],
      }) as MethodResult
    })

    return {
      label,
      values,
      type: "normal",
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: DynamicDataArgs
  ): MethodResult {
    return ty.accept(this, data)
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[]>
  ): OptionalMethodResult {
    if (value?.length === 0) {
      return {
        type: "optional",
        label,
        value: null,
      }
    }

    return {
      label,
      value: ty.accept(this, { value: value[0], label }),
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

      acc.push(field)

      return acc
    }, [] as Array<MethodResult>)

    return {
      label,
      values,
      type: "record",
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: DynamicDataArgs<unknown[]>
  ): TupleMethodResult {
    if (value.length === 2) {
      const compResult = components[0].accept(this, {
        label: "",
        value: value[0],
      }) as TextMethodResult | PrincipalMethodResult
      const textValue = compResult.value?.toString()
      const textLabel = compResult.label
        ? `${compResult.label}.${textValue}`
        : textValue

      if (textValue) {
        const { label, values } = this.visitRecord(
          t,
          [[textValue, components[1]]],
          {
            value: { [textValue]: value[1] },
            label: textLabel,
          }
        )

        return {
          ...values[0],
          label,
        } as TupleMethodResult
      }
    }

    const values = components.map((type, index) =>
      type.accept(this, { label, value: value[index] })
    )

    return {
      label,
      values,
      type: "tuple",
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: DynamicDataArgs<Record<string, unknown>>
  ): MethodResult {
    // Find the first field that matches and has a value
    for (const [key, type] of fields) {
      if (value[key] !== undefined) {
        return type.accept(this, {
          label: label === "" ? key : label,
          value: value[key] === null ? key : value[key],
        })
      }
    }

    return {
      label,
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
        label,
        value: t.encodeValue(value),
        type: "vector",
        componentType: "blob",
      }
    }

    const values = value.map((value, index) => {
      return ty.accept(this, {
        label: `${label}.${index}`,
        value,
      })
    })

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
      ? TAMESTAMP_KEYS.includes(label)
        ? "timestamp"
        : label === "cycle"
        ? "cycle"
        : "bigInt"
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
    data: DynamicDataArgs<string>
  ): TextMethodResult {
    return {
      ...data,
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
