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
  NullMethodResult,
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
      type: "normal",
      label,
      values,
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
      type: "optional",
      label,
      value: ty.accept(this, { value: value[0], label }),
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

      if (type instanceof IDL.VariantClass) {
        const { label: variantLabel, value: variantValue } = type.accept(this, {
          label: "",
          value: value[key],
        }) as MethodResult<"null">

        if (variantValue === null) {
          acc.push({
            type: "text",
            label: key,
            value: variantLabel,
            componentType: "normal",
          })

          return acc
        }
      }

      const field = type.accept(this, {
        label: key,
        value: value[key],
      })

      acc.push(field)

      return acc
    }, [] as Array<MethodResult>)

    return {
      type: "record",
      label,
      values,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: DynamicDataArgs<unknown[]>
  ): TupleMethodResult {
    if (value.length === 2) {
      const { value: textValue, label: nullLabel } = components[0].accept(
        this,
        {
          label: "",
          value: value[0],
        }
      ) as TextMethodResult

      const labelValue = typeof textValue === "string" ? textValue : nullLabel

      if (labelValue) {
        const { values } = this.visitRecord(t, [[labelValue, components[1]]], {
          value: { [labelValue]: value[1] },
          label: "",
        })
        return values[0] as TupleMethodResult
      }
    }

    const values = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, {
          label,
          value: value[index],
        }) as MethodResult
        acc.push(field)

        return acc
      },

      [] as Array<MethodResult>
    )

    return {
      type: "tuple",
      label,
      values,
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
          value: value[key],
        })
      }
    }

    return {
      type: "unknown",
      label,
      value: "No matching variant",
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[]>
  ): VectorMethodResult {
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return {
        type: "vector",
        componentType: "blob",
        label,
        value: t.encodeValue(value),
      }
    }

    const values = value.map((value, index) => {
      return ty.accept(this, {
        label: `${label}.${index}`,
        value,
      })
    })

    return {
      type: "vector",
      componentType: "normal",
      label,
      values,
    }
  }

  public visitText(
    _t: IDL.TextClass,
    { value, label }: DynamicDataArgs<string>
  ): TextMethodResult {
    const isurl = isUrl(value)
    const isImg = isImage(value)

    return {
      type: "text",
      componentType: isImg ? "image" : isurl ? "url" : "normal",
      label,
      value,
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
      type: "number",
      componentType,
      label,
      value,
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
    data: DynamicDataArgs<unknown>
  ): NullMethodResult {
    return {
      type: "null",
      value: null,
      label: data.label,
    }
  }

  public visitBool(
    _t: IDL.BoolClass,
    { value, label }: DynamicDataArgs<boolean>
  ): BooleanMethodResult {
    return {
      type: "boolean",
      label,
      value,
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    { value, label }: DynamicDataArgs<Principal>
  ): PrincipalMethodResult {
    return {
      type: "principal",
      label,
      value,
    }
  }

  public visitType<T>(
    t: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T>
  ): UnknownMethodResult {
    return {
      type: "unknown",
      label,
      value: t.valueToString(value),
    }
  }
}
