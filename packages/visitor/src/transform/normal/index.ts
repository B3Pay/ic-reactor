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
      description: t.name,
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
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: DynamicDataArgs<T[]>
  ): OptionalMethodResult {
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
    }, [] as Array<MethodResult>)

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
    { value, label }: DynamicDataArgs<unknown[]>
  ): TupleMethodResult | RecordMethodResult {
    if (value.length === 2) {
      const [first, second] = value
      if (typeof first === "string") {
        return this.visitRecord(t, [[first, components[1] as IDL.Type]], {
          value: { [first]: second },
          label: first,
        })
      }
    }

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
  ): MethodResult {
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
        type: "vector",
        componentType: "blob",
        label,
        description: t.name,
        value: t.encodeValue(value),
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
      componentType: "normal",
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
      type: "text",
      componentType: isImg ? "image" : isurl ? "url" : "normal",
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
