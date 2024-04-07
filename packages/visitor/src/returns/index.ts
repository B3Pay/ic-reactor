import type {
  ReturnTypeFromIDLType,
  DefaultReturn,
  MethodReturns,
  NumberReturn,
  PrincipalReturn,
  OptionalReturns,
  RecordReturns,
  RecursiveReturns,
  TupleReturns,
  VariantReturns,
  VectorReturns,
  DynamicReturnTypeByClass,
  AllReturnTypes,
  ServiceReturns,
  BlobReturns,
} from "./types"
import { IDL } from "@dfinity/candid"
import type { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { ReturnDefaultValues } from "./types"
import { isQuery } from "../helper"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitReturns<A = BaseActor> extends IDL.Visitor<
  string,
  MethodReturns<A> | DefaultReturn | ServiceReturns<A>
> {
  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodReturns<A> {
    const functionType = isQuery(t) ? "query" : "update"
    const { fields } = t.retTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `ret${index}`) as ReturnTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        return acc
      },
      {
        fields: [] as DynamicReturnTypeByClass<IDL.Type>[],
      }
    )

    const transformData = (
      data: unknown | unknown[]
    ): ReturnDefaultValues<A> => {
      if (t.retTypes.length === 1) {
        return {
          [functionName]: {
            ret0: data,
          } as Record<`ret${number}`, unknown>,
        } as ReturnDefaultValues<A>
      }

      const returnData = t.argTypes.reduce((acc, _, index) => {
        acc[`ret${index}`] = (data as unknown[])[index]

        return acc
      }, {} as Record<`ret${number}`, unknown>)

      return { [functionName]: returnData } as ReturnDefaultValues<A>
    }

    return {
      functionName,
      functionType,
      transformData,
      fields,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): RecordReturns<IDL.Type> {
    const { fields } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllReturnTypes<typeof type>

        acc.fields.push(field)

        return acc
      },
      {
        fields: [] as AllReturnTypes<IDL.Type>[],
        defaultValues: {} as Record<string, ReturnTypeFromIDLType<IDL.Type>>,
      }
    )

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
  ): VariantReturns<IDL.Type> {
    const { fields, options } = fields_.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllReturnTypes<typeof type>

        acc.fields.push(field)
        acc.options.push(key)

        return acc
      },
      {
        fields: [] as AllReturnTypes<IDL.Type>[],
        options: [] as string[],
      }
    )

    return {
      type: "variant",
      fields,
      options,
      selected: options[0],
      label,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleReturns<IDL.Type> {
    const { fields } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllReturnTypes<
          typeof type
        >
        acc.fields.push(field)

        return acc
      },
      {
        fields: [] as AllReturnTypes<IDL.Type>[],
        defaultValues: [] as ReturnTypeFromIDLType<IDL.Type>[],
      }
    )

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
  ): RecursiveReturns {
    return {
      type: "recursive",
      label,
      name: ty.name,
      extract: () => ty.accept(this, label) as VariantReturns<IDL.Type>,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalReturns {
    const field = ty.accept(this, label) as DynamicReturnTypeByClass<typeof ty>

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
  ): VectorReturns | BlobReturns {
    const field = ty.accept(this, label) as DynamicReturnTypeByClass<typeof ty>

    if ("_bits" in ty && ty._bits === 8) {
      return {
        type: "blob",

        label,
      }
    }

    return {
      type: "vector",
      field,
      label,
    }
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): DefaultReturn {
    return {
      type: "unknown",
      label,
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    label: string
  ): PrincipalReturn {
    return {
      type: "principal",
      label,
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): DefaultReturn {
    return {
      type: "boolean",
      label,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): DefaultReturn {
    return {
      type: "null",
      label,
    }
  }

  public visitText(_t: IDL.TextClass, label: string): DefaultReturn {
    return {
      type: "text",
      label,
    }
  }

  public visitNumber<T>(_t: IDL.Type<T>, label: string): NumberReturn {
    return {
      type: "number",
      label,
    }
  }

  public visitInt(t: IDL.IntClass, label: string): NumberReturn {
    return this.visitNumber(t, label)
  }

  public visitNat(t: IDL.NatClass, label: string): NumberReturn {
    return this.visitNumber(t, label)
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberReturn {
    return this.visitNumber(t, label)
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): NumberReturn {
    return this.visitNumber(t, label)
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): NumberReturn {
    return this.visitNumber(t, label)
  }

  public visitService(t: IDL.ServiceClass): ServiceReturns<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodReturns<A>

      return acc
    }, {} as ServiceReturns<A>)

    return methodFields
  }
}
