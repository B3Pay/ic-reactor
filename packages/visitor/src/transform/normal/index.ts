import { IDL } from "@dfinity/candid"
import type {
  MethodResult,
  DynamicDataArgs,
  ReturnDataType,
  NormalMethodResult,
  RecordMethodResult,
  TupleMethodResult,
  VectorMethodResult,
  NumberMethodResult,
  TextMethodResult,
  BooleanMethodResult,
  UnknownMethodResult,
  PrincipalMethodResult,
} from "../types"
import { isImage, isUrl } from "../../helper"
import type { Principal } from "@ic-reactor/core/dist/types"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitTransform extends IDL.Visitor<
  DynamicDataArgs,
  MethodResult<ReturnDataType>
> {
  public visitFunc(
    t: IDL.FuncClass,
    { value, label }: DynamicDataArgs
  ): NormalMethodResult {
    const dataValues = Array.isArray(value) ? value : [value]
    const values = t.retTypes.map((type, index) => {
      return type.accept(this, {
        label: `ret${index}`,
        value: dataValues[index],
      }) as MethodResult<ReturnDataType>
    })

    return {
      type: "normal",
      label,
      description: t.name,
      values,
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: DynamicDataArgs
  ): MethodResult<ReturnDataType> {
    return ty.accept(this, data)
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[]>
  ): MethodResult<"optional"> {
    if (value?.length === 0) {
      return {
        type: "optional",
        label,
        description: t.name,
        value: null,
      }
    }

    return {
      type: "optional",
      label,
      description: t.name,
      value: ty.accept(this, { value: value[0], label }),
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: DynamicDataArgs<Record<string, unknown>>
  ): RecordMethodResult {
    const values = fields.reduce((acc, [key, type]) => {
      const field = type.accept(this, {
        label: key,
        value: value[key],
      })

      acc.push(field)

      return acc
    }, [] as Array<MethodResult<ReturnDataType>>)

    return {
      type: "record",
      label,
      description: t.name,
      values,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: DynamicDataArgs<T>
  ): TupleMethodResult {
    const values = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, {
          label: `_${index}_`,
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
      description: t.name,
      values,
    }
  }
  public visitVariant(
    t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: DynamicDataArgs<Record<string, unknown>>
  ): MethodResult<ReturnDataType> {
    // Find the first field that matches and has a value
    for (const [key, type] of fields) {
      if (value[key] !== undefined) {
        return type.accept(this, {
          label: key,
          value: value[key],
        })
      }
    }

    return {
      type: "unknown",
      label,
      description: t.name,
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
        type: "blob",
        label,
        description: t.name,
        value: value as unknown as Uint8Array,
      }
    }

    const values = value.map((val, index) =>
      ty.accept(this, {
        label: `${label}-${index}`,
        value: val,
      })
    )

    return {
      type: "vector",
      label,
      description: t.name,
      values,
    }
  }

  public visitNumber<T>(
    t: IDL.Type<T>,
    { value, label }: DynamicDataArgs<number>
  ): NumberMethodResult {
    return {
      type: "number",
      label,
      description: t.name,
      value,
    }
  }

  public visitText(
    t: IDL.TextClass,
    { value, label }: DynamicDataArgs<string>
  ): TextMethodResult {
    const isurl = isUrl(value)
    const isImg = isImage(value)

    return {
      type: isImg ? "image" : isurl ? "url" : "text",
      label,
      description: t.name,
      value,
    }
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

  public visitBool(
    t: IDL.BoolClass,
    { value, label }: DynamicDataArgs<boolean>
  ): BooleanMethodResult {
    return {
      type: "boolean",
      label,
      description: t.name,
      value,
    }
  }

  public visitPrincipal(
    t: IDL.PrincipalClass,
    { value, label }: DynamicDataArgs<Principal>
  ): PrincipalMethodResult {
    return {
      type: "principal",
      label,
      description: t.name,
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
      description: t.name,
      value: t.valueToString(value),
    }
  }
}
