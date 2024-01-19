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
  ExtractedService,
  ExtractedTuple,
  ExtractedVariant,
  ExtractedVector,
  FunctionDefaultValues,
  DynamicFieldTypeByClass,
  AllExtractableType,
  MethodChildDetail,
  FunctionChildDetails,
  ServiceMethodDetails,
  ServiceMethodFields,
} from "./types"
import { IDL } from "@dfinity/candid"
import { is_query, validateError } from "./helper"
import { ActorSubclass } from "@dfinity/agent"

export * from "./types"
export * from "./helper"

export class ExtractField<A extends ActorSubclass<any>> extends IDL.Visitor<
  string,
  ExtractedField | ExtractedService<A> | ExtractedFunction<A>
> {
  public counter = 0

  public visitService(
    t: IDL.ServiceClass,
    canisterId: string
  ): ExtractedService<A> {
    type MethodName = keyof A

    const { methodDetails, methodFields } = t._fields.reduce(
      (acc, [functionName, func]) => {
        const order = this.counter++

        const functionData = func.accept(
          this,
          functionName
        ) as ExtractedFunction<A>

        acc.methodFields[functionName as MethodName] = functionData

        acc.methodDetails.push({
          order,
          type: is_query(func) ? "query" : "update",
          functionName: functionName as MethodName,
          description: func.name,
          childDetails: functionData.childDetails,
        })

        return acc
      },
      {
        methodFields: {} as ServiceMethodFields<A>,
        methodDetails: [] as ServiceMethodDetails<A>,
      }
    )

    return {
      canisterId,
      description: t.name,
      methodFields,
      methodDetails,
    }
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: keyof A & string
  ): ExtractedFunction<A> {
    const { fields, childDetails, defaultValues } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `arg${index}`) as ExtractTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        acc.childDetails[`arg${index}`] = field.childDetails || {
          label: `arg${index}`,
          description: arg.name,
        }

        acc.defaultValues[`arg${index}`] =
          field.defaultValue || field.defaultValues

        return acc
      },
      {
        fields: [] as DynamicFieldTypeByClass<IDL.Type<any>>[],
        defaultValues: {} as FunctionDefaultValues<keyof A & string>,
        childDetails: {} as FunctionChildDetails<A>,
      }
    )

    return {
      type: is_query(t) ? "query" : "update",
      validate: validateError(t),
      functionName,
      description: t.name,
      fields,
      defaultValues,
      childDetails,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): ExtractedRecord<IDL.Type<any>> {
    const { fields, defaultValues, childDetails } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllExtractableType<typeof type>

        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValue || field.defaultValues
        acc.childDetails[key] = (field.childDetails as MethodChildDetail) || {
          label: key,
          description: type.name,
        }

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type>[],
        defaultValues: {} as Record<string, ExtractTypeFromIDLType>,
        childDetails: {} as Record<string, MethodChildDetail>,
      }
    )

    return {
      type: "record",
      label,
      description: t.name,
      validate: validateError(t),
      fields,
      defaultValues,
      childDetails,
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): ExtractedVariant<IDL.Type<any>> {
    const { fields, options } = _fields.reduce(
      (acc, [label, type]) => {
        const field = type.accept(this, label) as AllExtractableType<
          typeof type
        >

        acc.fields.push(field)
        acc.options.push(label)

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
      defaultValue,
      defaultValues,
      label,
      description: t.name,
      validate: validateError(t),
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): ExtractedTuple<IDL.Type<any>> {
    const { fields, defaultValues, childDetails } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllExtractableType<
          typeof type
        >

        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValue || field.defaultValues)
        acc.childDetails.push(
          (field.childDetails as MethodChildDetail) || {
            label: `_${index}_`,
            description: type.name,
          }
        )

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type>[],
        defaultValues: [] as any[],
        childDetails: [] as MethodChildDetail[],
      }
    )

    return {
      type: "tuple",
      label,
      description: t.name,
      validate: validateError(t),
      fields,
      childDetails,
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
      description: t.name,
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
    return {
      type: "optional",
      validate: validateError(t),
      label,
      description: t.name,
      field: ty.accept(this, label) as DynamicFieldTypeByClass<IDL.Type>,
      defaultValue: [],
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): ExtractedVector {
    return {
      type: "vector",
      validate: validateError(t),
      label,
      description: t.name,
      field: ty.accept(this, label) as DynamicFieldTypeByClass<IDL.Type>,
      defaultValue: [],
    }
  }

  public visitType<T>(t: IDL.Type<T>, label: string): ExtractedField {
    return {
      type: "unknown",
      validate: validateError(t),
      label,
      description: t.name,
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
      description: t.name,
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
      description: t.name,
      defaultValue: false,
    }
  }

  public visitNull(
    t: IDL.NullClass,
    label: string
  ): ExtractedInputField<typeof t> {
    return {
      type: "null",
      label,
      required: true,
      description: t.name,
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
      label,
      required: true,
      description: t.name,
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
      description: t.name,
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
