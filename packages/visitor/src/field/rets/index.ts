import { IDL } from "@dfinity/candid"
import { isQuery, isFieldInTable } from "../../helpers"
import { TAMESTAMP_KEYS_REGEX, VALUE_KEYS_REGEX } from "../../constants"

import type {
  ReturnTypeFromIDLType,
  DefaultReturn,
  MethodReturn,
  NumberReturn,
  PrincipalReturn,
  OptionalReturn,
  RecordReturn,
  RecursiveReturn,
  TupleReturn,
  VariantReturn,
  VectorReturn,
  DynamicReturnTypeByClass,
  AllReturnTypes,
  ServiceReturn,
  BlobReturn,
  MethodRetsDefaultValues,
  ListReturn,
  FunctionRecordReturn,
  FunctionExtractedData,
  FunctionMethodReturn,
} from "./types"
import type {
  ArgTypeFromIDLType,
  BaseActor,
  FunctionName,
  Principal,
} from "../../types"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitReturn<A = BaseActor> extends IDL.Visitor<
  string,
  MethodReturn<A> | DefaultReturn | ServiceReturn<A>
> {
  private inVisit = false
  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodReturn<A> {
    if (this.inVisit) {
      return {
        type: "function",
        label: functionName,
        functionClass: t,
      }
    }

    const functionType = isQuery(t) ? "query" : "update"

    const { fields, defaultValues } = t.retTypes.reduce(
      (acc, ret, index) => {
        this.inVisit = true
        const field = ret.accept(
          this,
          `__ret${index}`
        ) as ReturnTypeFromIDLType<typeof ret>
        this.inVisit = false

        acc.fields.push(field)
        acc.defaultValues[`ret${index}`] = undefined as ReturnTypeFromIDLType<
          typeof ret
        >

        return acc
      },
      {
        fields: [] as DynamicReturnTypeByClass<IDL.Type>[],
        defaultValues: {} as MethodRetsDefaultValues<FunctionName<A>>,
      }
    )

    const transformData = (
      data: unknown | unknown[]
    ): MethodRetsDefaultValues => {
      if (t.retTypes.length === 1) {
        return {
          ret0: data,
        } as MethodRetsDefaultValues
      }

      return t.retTypes.reduce((acc, _, index) => {
        acc[`ret${index}`] = (data as ReturnTypeFromIDLType<IDL.Type>[])[index]

        return acc
      }, {} as MethodRetsDefaultValues)
    }

    return {
      type: "normal",
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
  ): RecordReturn<IDL.Type> | FunctionRecordReturn<IDL.Type> {
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

    if (fields[0]?.type === "function") {
      const func = fields[0] as FunctionMethodReturn
      const argFields = fields.slice(1)

      const extract = <T extends IDL.Type = IDL.Type>(
        values: Record<string, unknown>
      ): FunctionExtractedData<T> => {
        const funcValues = values[func.label] as [Principal, string]

        const canisterId = funcValues[0]
        const functionName = funcValues[1]
        const idlFactory = () =>
          IDL.Service({
            [functionName]: func.functionClass,
          })

        const args = argFields.reduce((acc, field) => {
          acc[field.label] = values[field.label] as ArgTypeFromIDLType<T>

          return acc
        }, {} as Record<string, ArgTypeFromIDLType<T>>)

        return {
          canisterId,
          idlFactory,
          functionName,
          args: [args],
        }
      }

      return {
        type: "functionRecord",
        label,
        extract,
      }
    }

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
  ): VariantReturn<IDL.Type> {
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
  ): TupleReturn<IDL.Type> {
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
  ): RecursiveReturn {
    return {
      type: "recursive",
      label,
      name: ty.name,
      extract: () => ty.accept(this, label) as VariantReturn<IDL.Type>,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalReturn {
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
  ): VectorReturn | BlobReturn | ListReturn {
    const field = ty.accept(this, label) as DynamicReturnTypeByClass<typeof ty>

    if ("_bits" in ty && ty._bits === 8) {
      return {
        type: "blob",
        label,
      }
    }

    if (field.type === "record") {
      const tableList: string[] = []

      const isList = (field as RecordReturn<IDL.Type>).fields.every((field) => {
        if (isFieldInTable(field)) {
          if (field.label) {
            tableList.push(field.label)
            return true
          }
        }
        return false
      })

      if (isList) {
        return {
          type: "table",
          label,
          tableList: tableList,
          fields: (field as RecordReturn<IDL.Type>).fields,
        }
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
    const componentType = label
      ? TAMESTAMP_KEYS_REGEX.test(label)
        ? "timestamp"
        : VALUE_KEYS_REGEX.test(label)
        ? "value"
        : label === "cycle"
        ? "cycle"
        : "normal"
      : "normal"

    return {
      type: "number",
      componentType,
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

  public visitService(t: IDL.ServiceClass): ServiceReturn<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodReturn<A>

      return acc
    }, {} as ServiceReturn<A>)

    return methodFields
  }
}
