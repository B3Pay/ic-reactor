import type {
  ExtractTypeFromIDLType,
  ExtractedField,
  ExtractedFunction,
  ExtractedInputField,
  ExtractedNumberField,
  ExtractedPrincipalField,
  ExtractedOptional,
  ExtractedRecord,
  ExtractedRecursive,
  ExtractedServiceFields,
  ExtractedTuple,
  ExtractedVariant,
  ExtractedVector,
  FunctionDefaultValues,
  DynamicFieldTypeByClass,
  AllExtractableType,
  ServiceMethodFields,
  ServiceDefaultValues,
} from "./types"
import { IDL } from "@dfinity/candid"
import { is_query, validateError } from "../helper"
import { ActorSubclass } from "@dfinity/agent"

export * from "./types"
export * from "../helper"

export class ExtractField<A extends ActorSubclass<any>> extends IDL.Visitor<
  string,
  ExtractedField | ExtractedServiceFields<A> | ExtractedFunction<A>
> {
  public counter = 0

  public visitService(
    t: IDL.ServiceClass,
    canisterId: string
  ): ExtractedServiceFields<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as keyof A & string
      const func = services[1]

      const functionData = func.accept(
        this,
        functionName
      ) as ExtractedFunction<A>

      acc[functionName] = functionData

      return acc
    }, {} as ServiceMethodFields<A>)

    return {
      canisterId,
      methodFields,
    }
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: keyof A & string
  ): ExtractedFunction<A> {
    const type = is_query(t) ? "query" : "update"

    const { fields, defaultValue } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `arg${index}`) as ExtractTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        acc.defaultValue.push(field.defaultValue || field.defaultValues)

        return acc
      },
      {
        fields: [] as DynamicFieldTypeByClass<IDL.Type<any>>[],
        defaultValue: [] as FunctionDefaultValues<keyof A>,
      }
    )

    const defaultValues = {
      [functionName]: defaultValue,
    } as ServiceDefaultValues<A>

    return {
      type,
      validate: validateError(t),
      functionName,
      defaultValues,
      fields,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): ExtractedRecord<IDL.Type<any>> {
    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllExtractableType<typeof type>

        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValue || field.defaultValues

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type>[],
        defaultValues: {} as Record<string, ExtractTypeFromIDLType>,
      }
    )

    return {
      type: "record",
      label,
      validate: validateError(t),
      fields,
      defaultValues,
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): ExtractedVariant<IDL.Type<any>> {
    const { fields, options } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllExtractableType<typeof type>

        acc.fields.push(field)
        acc.options.push(key)

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type>[],
        options: [] as string[],
      }
    )

    const defaultValue = options[0]

    const defaultValues = {
      [defaultValue]: fields[0].defaultValue || fields[0].defaultValues,
    }

    return {
      type: "variant",
      fields,
      options,
      label,
      defaultValue,
      defaultValues,
      validate: validateError(t),
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): ExtractedTuple<IDL.Type<any>> {
    const { fields, defaultValues } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllExtractableType<
          typeof type
        >
        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValue || field.defaultValues)

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type>[],
        defaultValues: [] as any[],
      }
    )

    return {
      type: "tuple",
      validate: validateError(t),
      fields,
      label,
      defaultValues,
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): ExtractedRecursive {
    return {
      type: "recursive",
      label,
      validate: validateError(t),
      extract: () =>
        ty.accept(this, label) as DynamicFieldTypeByClass<IDL.Type>,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): ExtractedOptional {
    const field = ty.accept(this, label) as DynamicFieldTypeByClass<typeof ty>

    return {
      type: "optional",
      field,
      defaultValue: [],
      validate: validateError(t),
      label,
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): ExtractedVector {
    const field = ty.accept(this, label) as DynamicFieldTypeByClass<typeof ty>

    return {
      type: "vector",
      field,
      validate: validateError(t),
      defaultValue: [],
      label,
    }
  }

  public visitType<T>(
    t: IDL.Type<T>,
    label: string
  ): ExtractedInputField<IDL.Type<T>> {
    return {
      type: "unknown",
      validate: validateError(t),
      label,
      required: true,
      defaultValue: undefined as any,
    }
  }

  public visitPrincipal(
    t: IDL.PrincipalClass,
    label: string
  ): ExtractedPrincipalField {
    return {
      type: "principal",
      validate: validateError(t),
      maxLength: 64,
      minLength: 7,
      label,
      required: true,
      defaultValue: "",
    }
  }

  public visitBool(
    t: IDL.BoolClass,
    label: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "boolean",
      validate: validateError(t),
      label,
      required: true,
      defaultValue: false,
    }
  }

  public visitNull(
    t: IDL.NullClass,
    label: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "null",
      required: true,
      label,
      validate: validateError(t),
      defaultValue: null,
    }
  }

  public visitText(
    t: IDL.TextClass,
    label: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "text",
      validate: validateError(t),
      required: true,
      label,
      defaultValue: "",
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, label: string): ExtractedNumberField {
    return {
      type: "number",
      required: true,
      valueAsNumber: true,
      validate: validateError(t),
      label,
      defaultValue: undefined,
    }
  }

  public visitInt(t: IDL.IntClass, label: string): ExtractedNumberField {
    return this.visitNumber(t, label)
  }

  public visitNat(t: IDL.NatClass, label: string): ExtractedNumberField {
    return this.visitNumber(t, label)
  }

  public visitFloat(t: IDL.FloatClass, label: string): ExtractedNumberField {
    return this.visitNumber(t, label)
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    label: string
  ): ExtractedNumberField {
    return this.visitNumber(t, label)
  }

  public visitFixedNat(
    t: IDL.FixedNatClass,
    label: string
  ): ExtractedNumberField {
    return this.visitNumber(t, label)
  }
}
