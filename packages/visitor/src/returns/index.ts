import type {
  FieldTypeFromIDLType,
  DefaultField,
  MethodFields,
  NumberField,
  PrincipalField,
  OptionalFields,
  RecordFields,
  RecursiveFields,
  TupleFields,
  VariantFields,
  VectorFields,
  DynamicFieldTypeByClass,
  AllFieldTypes,
  ServiceFields,
  BlobFields,
} from "./types"
import { isQuery } from "../helper"
import { IDL } from "@dfinity/candid"
import type { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitReturns<A = BaseActor> extends IDL.Visitor<
  string,
  MethodFields<A> | DefaultField | ServiceFields<A>
> {
  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodFields<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const fields = t.retTypes.reduce((acc, arg, index) => {
      const field = arg.accept(this, `arg${index}`) as FieldTypeFromIDLType<
        typeof arg
      >

      acc.push(field)

      return acc
    }, [] as DynamicFieldTypeByClass<IDL.Type>[])

    return {
      functionType,
      functionName,
      fields,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): RecordFields<IDL.Type> {
    const fields = _fields.reduce((acc, [key, type]) => {
      const field = type.accept(this, key) as AllFieldTypes<typeof type>

      acc.push(field)
      return acc
    }, [] as AllFieldTypes<IDL.Type>[])

    return {
      type: "record",
      label,
      fields,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): VariantFields<IDL.Type> {
    const { fields, options } = fields_.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllFieldTypes<typeof type>

        acc.fields.push(field)
        acc.options.push(key)

        return acc
      },
      {
        fields: [] as AllFieldTypes<IDL.Type>[],
        options: [] as string[],
      }
    )

    return {
      type: "variant",
      fields,
      options,
      label,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleFields<IDL.Type> {
    const fields = components.reduce((acc, type, index) => {
      const field = type.accept(this, `_${index}_`) as AllFieldTypes<
        typeof type
      >
      acc.push(field)
      return acc
    }, [] as AllFieldTypes<IDL.Type>[])

    return {
      type: "tuple",
      fields,
      label,
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): RecursiveFields {
    return {
      type: "recursive",
      label,
      name: ty.name,
      extract: () => ty.accept(this, label) as VariantFields<IDL.Type>,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalFields {
    const field = ty.accept(this, label) as DynamicFieldTypeByClass<typeof ty>

    return {
      type: "optional",
      field,
      label,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): VectorFields | BlobFields {
    const field = ty.accept(this, label) as DynamicFieldTypeByClass<typeof ty>

    if ("_bits" in ty && ty._bits === 8) {
      return {
        type: "blob",
        field,
        label,
      }
    }

    return {
      type: "vector",
      field,
      label,
    }
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): DefaultField {
    return {
      type: "unknown",
      label,
    }
  }

  public visitPrincipal(_t: IDL.PrincipalClass, label: string): PrincipalField {
    return {
      type: "principal",
      label,
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): DefaultField {
    return {
      type: "boolean",
      label,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): DefaultField {
    return {
      type: "null",
      label,
    }
  }

  public visitText(_t: IDL.TextClass, label: string): DefaultField {
    return {
      type: "text",
      label,
    }
  }

  public visitNumber<T>(_t: IDL.Type<T>, label: string): NumberField {
    return {
      type: "number",
      label,
    }
  }

  public visitInt(t: IDL.IntClass, label: string): NumberField {
    return this.visitNumber(t, label)
  }

  public visitNat(t: IDL.NatClass, label: string): NumberField {
    return this.visitNumber(t, label)
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberField {
    return this.visitNumber(t, label)
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): NumberField {
    return this.visitNumber(t, label)
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): NumberField {
    return this.visitNumber(t, label)
  }

  public visitService(t: IDL.ServiceClass): ServiceFields<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodFields<A>

      return acc
    }, {} as ServiceFields<A>)

    return methodFields
  }
}
