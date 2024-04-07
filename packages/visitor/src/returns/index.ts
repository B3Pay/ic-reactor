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
  ReturnMethodDefaultValues,
  InputReturn,
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
    const { fields, defaultValue } = t.retTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `ret${index}`) as ReturnTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        acc.defaultValue[`ret${index}`] =
          field.defaultValue ?? field.defaultValues ?? {}

        return acc
      },
      {
        fields: [] as DynamicReturnTypeByClass<IDL.Type>[],
        defaultValue: {} as ReturnMethodDefaultValues<FunctionName<A>>,
      }
    )

    const defaultValues = {
      [functionName]: defaultValue,
    } as ReturnDefaultValues<A>

    const transformData = (
      data: unknown | unknown[]
    ): ReturnDefaultValues<A> => {
      if (!Array.isArray(data)) {
        return {
          [functionName]: {
            ret0: data,
          },
        } as unknown as ReturnDefaultValues<A>
      }

      const returnData = t.argTypes.reduce((acc, _, index) => {
        acc[`ret${index}`] = data[index]

        return acc
      }, {} as Record<`ret${number}`, ReturnTypeFromIDLType<IDL.Type>>)

      return { [functionName]: returnData } as unknown as ReturnDefaultValues<A>
    }

    return {
      functionName,
      functionType,
      defaultValues,
      transformData,
      fields,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): RecordReturns<IDL.Type> {
    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllReturnTypes<typeof type>

        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValue || field.defaultValues

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
      defaultValues,
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

    const defaultValue = options[0]

    const defaultValues = {
      [defaultValue]: fields[0].defaultValue ?? fields[0].defaultValues ?? {},
    }

    return {
      type: "variant",
      fields,
      options,
      label,
      defaultValue,
      defaultValues,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleReturns<IDL.Type> {
    const { fields, defaultValues } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllReturnTypes<
          typeof type
        >
        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValue || field.defaultValues)

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
      defaultValues,
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
      defaultValue: [field.defaultValue as never],
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
        defaultValue: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
        label,
      }
    }

    return {
      type: "vector",
      field,
      defaultValue: [field.defaultValue as never],
      label,
    }
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): DefaultReturn {
    return {
      type: "unknown",
      label,
      defaultValue: undefined as InputReturn<IDL.Type<T>>["defaultValue"],
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    label: string
  ): PrincipalReturn {
    return {
      type: "principal",
      label,
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      defaultValue: require("@dfinity/principal").Principal.anonymous(),
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): DefaultReturn {
    return {
      type: "boolean",
      label,
      defaultValue: false,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): DefaultReturn {
    return {
      type: "null",
      label,
      defaultValue: null,
    }
  }

  public visitText(_t: IDL.TextClass, label: string): DefaultReturn {
    return {
      type: "text",
      label,
      defaultValue: "abcdefghij",
    }
  }

  public visitNumber<T>(_t: IDL.Type<T>, label: string): NumberReturn {
    return {
      type: "number",
      label,
      defaultValue: 1234567890,
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
