import type {
  AllExtractableType,
  ExtractTypeFromIDLType,
  ExtractedField,
  ExtractedFunction,
  ExtractedInputField,
  ExtractedNumberField,
  ExtractedPrincipalField,
  ExtractedOptional,
  ExtractedRecord,
  ExtractedRecursive,
  ExtractedService,
  ExtractedTuple,
  ExtractedVariant,
  ExtractedVector,
  FunctionDefaultValues,
  DynamicFieldType,
} from "./types"
import { IDL } from "@dfinity/candid"
import { is_query, validateError } from "./helper"
import { ActorSubclass } from "@dfinity/agent"

export * from "./types"
export * from "./helper"

export class ExtractField<A extends ActorSubclass<any>> extends IDL.Visitor<
  string | undefined,
  ExtractedField
> {
  public visitService(t: IDL.ServiceClass, l?: string): ExtractedService<A> {
    return {
      type: "service",
      validate: validateError(t),
      label: l ?? t.name,
      fields: t._fields.map(
        ([methodName, method]) =>
          method.accept(this, methodName) as ExtractedFunction<A>
      ),
    }
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: keyof A & string
  ): ExtractedFunction<A> {
    const { fields, defaultValues } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, arg.name) as ExtractTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)
        acc.defaultValues.data[`${functionName}-arg${index}`] =
          field.defaultValues

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type<any>>[],
        defaultValues: { data: {} } as FunctionDefaultValues<keyof A & string>,
      }
    )

    return {
      type: "function",
      validate: validateError(t),
      label: is_query(t) ? "query" : "update",
      fields,
      defaultValues,
      functionName,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    l?: string
  ): ExtractedRecord<IDL.Type<any>> {
    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllExtractableType<typeof type>

        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValues

        return acc
      },
      {
        fields: [] as DynamicFieldType<IDL.Type>[],
        defaultValues: {} as Record<string, ExtractTypeFromIDLType>,
      }
    )

    return {
      type: "record",
      label: l ?? t.name,
      validate: validateError(t),
      fields,
      defaultValues,
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    l?: string
  ): ExtractedVariant<IDL.Type<any>> {
    const { fields, defaultValues, options } = _fields.reduce(
      (acc, [label, type]) => {
        const field = type.accept(this, label) as AllExtractableType<
          typeof type
        >

        acc.fields.push(field)
        acc.options.push(label)
        acc.defaultValues[label] = field.defaultValues

        return acc
      },
      {
        fields: [] as DynamicFieldType<IDL.Type>[],
        defaultValues: {} as Record<string, ExtractTypeFromIDLType>,
        options: [] as string[],
      }
    )

    return {
      type: "variant",
      fields,
      options,
      defaultValues,
      label: l ?? t.name,
      validate: validateError(t),
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    l?: string
  ): ExtractedTuple<IDL.Type<any>> {
    const { fields, defaultValues } = components.reduce(
      (acc, type) => {
        const field = type.accept(this, null) as AllExtractableType<typeof type>

        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValues)

        return acc
      },
      { fields: [] as DynamicFieldType<IDL.Type>[], defaultValues: [] as any[] }
    )

    return {
      type: "tuple",
      label: l ?? t.name,
      validate: validateError(t),
      fields,
      defaultValues,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    l?: string
  ): ExtractedOptional {
    return {
      type: "optional",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [ty.accept(this, l) as DynamicFieldType<IDL.Type>],
      defaultValues: [],
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    l?: string
  ): ExtractedVector {
    return {
      type: "vector",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [ty.accept(this, l) as DynamicFieldType<IDL.Type>],
      defaultValues: [],
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    l?: string
  ): ExtractedRecursive {
    return {
      type: "recursive",
      label: l ?? t.name,
      validate: validateError(t),
      extract: () => ty.accept(this, null) as DynamicFieldType<IDL.Type>,
      defaultValues: undefined,
    }
  }

  public visitType<T>(t: IDL.Type<T>, l?: string): ExtractedField {
    return {
      type: "unknown",
      validate: validateError(t),
      label: l ?? t.name,
    }
  }

  public visitText(
    t: IDL.TextClass,
    l?: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "text",
      validate: validateError(t),
      required: true,
      label: l ?? t.name,
      defaultValues: "",
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, l?: string): ExtractedNumberField {
    return {
      type: "number",
      valueAsNumber: true,
      required: true,
      validate: validateError(t),
      label: l ?? t.name,
      defaultValues: undefined,
    }
  }

  public visitInt(t: IDL.IntClass, l?: string): ExtractedNumberField {
    return this.visitNumber(t, l)
  }

  public visitNat(t: IDL.NatClass, l?: string): ExtractedNumberField {
    return this.visitNumber(t, l)
  }

  public visitFloat(t: IDL.FloatClass, l?: string): ExtractedNumberField {
    return this.visitNumber(t, l)
  }

  public visitFixedInt(t: IDL.FixedIntClass, l?: string): ExtractedNumberField {
    return this.visitNumber(t, l)
  }

  public visitFixedNat(t: IDL.FixedNatClass, l?: string): ExtractedNumberField {
    return this.visitNumber(t, l)
  }

  public visitPrincipal(
    t: IDL.PrincipalClass,
    l?: string
  ): ExtractedPrincipalField {
    return {
      type: "principal",
      validate: validateError(t),
      maxLength: 64,
      minLength: 7,
      label: l ?? t.name,
      defaultValues: undefined,
    }
  }

  public visitBool(
    t: IDL.BoolClass,
    l?: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "checkbox",
      validate: validateError(t),
      label: l ?? t.name,
      defaultValues: false,
    }
  }

  public visitNull(
    t: IDL.NullClass,
    l?: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "null",
      label: l ?? t.name,
      validate: validateError(t),
      defaultValues: null,
    }
  }
}
