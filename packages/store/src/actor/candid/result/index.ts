import { IDL } from "@dfinity/candid"
import type { ActorSubclass } from "@dfinity/agent"
import type { DefaultActorType } from "../../types"
import type {
  ResultData,
  ResultRecordData,
  ResultArrayData,
  ResultUnknownData,
  MethodResult,
} from "./types"

export * from "./types"

export class ExtractResult<
  A extends ActorSubclass<any> = DefaultActorType
> extends IDL.Visitor<
  ResultData<A> | ResultRecordData<A> | ResultArrayData<A> | ResultUnknownData,
  MethodResult<A>
> {
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: ResultData<A>
  ): MethodResult<A> {
    return ty.accept(this, data) as MethodResult<A>
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: ResultArrayData<A>
  ): MethodResult<A> {
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
    { value, label }: ResultRecordData<A>
  ): MethodResult<A> {
    console.log("visitRecord", t, fields, value, label)
    const values = fields.reduce((acc, [key, type]) => {
      if (value[key] === undefined) {
        return acc
      }

      const field = type.accept(this, {
        label: key,
        value: value[key],
      }) as MethodResult<A>

      acc.push(field)

      return acc
    }, [] as Array<MethodResult<A>>)

    return {
      type: "record",
      label,
      description: t.name,
      values,
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: ResultArrayData<A>
  ): MethodResult<A> {
    const values = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, {
          label: `_${index}_`,
          value: value[index],
        }) as MethodResult<A>
        acc.push(field)

        return acc
      },

      [] as MethodResult<A>[]
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
    { value, label }: ResultRecordData<A>
  ): MethodResult<A> {
    // Find the first field that matches and has a value
    for (const [key, type] of fields) {
      if (value[key] !== undefined) {
        return type.accept(this, {
          label: key,
          value: value[key],
        }) as MethodResult<A>
      }
    }

    return {
      type: "variant",
      label,
      description: t.name,
    }
  }
  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    { value, label }: ResultArrayData<A>
  ): MethodResult<A> {
    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return {
        type: "blob",
        label,
        description: t.name,
        value: value as unknown as Uint8Array,
      }
    }

    const values = value.map(
      (val, index) =>
        ty.accept(this, {
          label: `${label}-${index}`,
          value: val,
        }) as MethodResult<A>
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
    { value, label }: ResultData<A>
  ): MethodResult<A> {
    return {
      type: "number",
      label,
      description: t.name,
      value,
    }
  }

  public visitText(
    t: IDL.TextClass,
    { value, label }: ResultData<A>
  ): MethodResult<A> {
    return {
      type: "text",
      label,
      description: t.name,
      value,
    }
  }

  public visitInt(t: IDL.IntClass, data: ResultData<A>): MethodResult<A> {
    return this.visitNumber(t, data)
  }

  public visitNat(t: IDL.NatClass, data: ResultData<A>): MethodResult<A> {
    return this.visitNumber(t, data)
  }

  public visitFloat(t: IDL.FloatClass, data: ResultData<A>): MethodResult<A> {
    return this.visitNumber(t, data)
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    data: ResultData<A>
  ): MethodResult<A> {
    return this.visitNumber(t, data)
  }

  public visitFixedNat(
    t: IDL.FixedNatClass,
    data: ResultData<A>
  ): MethodResult<A> {
    return this.visitNumber(t, data)
  }

  public visitBool(
    t: IDL.BoolClass,
    { value, label }: ResultData<A>
  ): MethodResult<A> {
    return {
      type: "boolean",
      label,
      description: t.name,
      value,
    }
  }

  public visitType<T>(
    t: IDL.Type<T>,
    { value, label }: ResultUnknownData
  ): MethodResult<A> {
    return {
      type: "unknown",
      label,
      description: t.name,
      value: t.valueToString(value),
    }
  }
  public visitPrincipal(
    t: IDL.PrincipalClass,
    { value, label }: ResultData<A>
  ): MethodResult<A> {
    return {
      type: "principal",
      label,
      description: t.name,
      value,
    }
  }
}
