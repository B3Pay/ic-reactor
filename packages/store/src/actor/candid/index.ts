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
  ServiceMethodDetails,
  ServiceMethodFields,
  ServiceDefaultValues,
  FunctionDetails,
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
    const { methodDetails, methodFields } = t._fields.reduce(
      (acc, services) => {
        const functionName = services[0] as keyof A & string
        const func = services[1]

        const functionData = func.accept(
          this,
          functionName
        ) as ExtractedFunction<A>

        acc.methodFields[functionName] = functionData

        acc.methodDetails[functionName] =
          functionData.childDetails[functionName]

        return acc
      },
      {
        methodFields: {} as ServiceMethodFields<A>,
        methodDetails: {} as ServiceMethodDetails<A>,
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
    const type = is_query(t) ? "query" : "update"

    const { fields, childDetail, defaultValue } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `arg${index}`) as ExtractTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        acc.childDetail[`arg${index}`] = field.childDetails || {
          label: `arg${index}`,
          description: arg.name,
        }

        acc.defaultValue[`arg${index}`] =
          field.defaultValue || field.defaultValue

        return acc
      },
      {
        fields: [] as DynamicFieldTypeByClass<IDL.Type<any>>[],
        defaultValue: {} as FunctionDefaultValues<keyof A>,
        childDetail: {
          order: this.counter++,
          label: functionName,
          description: t.name,
          functionName,
          type,
        } as FunctionDetails<A>,
      }
    )

    const defaultValues = {
      [functionName]: defaultValue,
    } as ServiceDefaultValues<A>

    const childDetails = {
      [functionName]: childDetail,
    } as ServiceMethodDetails<A>

    return {
      type,
      validate: validateError(t),
      fields,
      functionName,
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
    const { fields, options, childDetails } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllExtractableType<typeof type>

        acc.fields.push(field)
        acc.options.push(key)
        acc.childDetails[key] = (field.childDetails as MethodChildDetail) || {
          label: key,
          description: type.name,
        }

        return acc
      },
      {
        fields: [] as AllExtractableType<IDL.Type>[],
        options: [] as string[],
        childDetails: {} as Record<string, MethodChildDetail>,
      }
    )

    const defaultValue = options[0]

    const defaultValues = {
      [defaultValue]: fields[0].defaultValue || fields[0].defaultValues,
    }

    return {
      type: "variant",
      label,
      fields,
      options,
      childDetails,
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
    const { fields, defaultValues, childDetails } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllExtractableType<
          typeof type
        >
        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValue || field.defaultValues)

        acc.childDetails[index] = (field.childDetails as MethodChildDetail) || {
          label: `_${index}_`,
          description: type.name,
        }

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
      validate: validateError(t),
      fields,
      childDetails,
      defaultValues,
    }
  }

  private recDetails: Record<
    string,
    { visited: boolean; details: MethodChildDetail }
  > = {}

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): ExtractedRecursive {
    const recLabel = `${label}-${this.counter}`

    if (!this.recDetails[recLabel]?.visited) {
      this.recDetails[recLabel] = {
        visited: true,
        details: {
          label,
          description: t.name,
        } as any,
      }
      const type = ty.accept(this, label) as AllExtractableType<typeof ty>

      this.recDetails[recLabel].details = type.childDetails
        ? ({
            ...this.recDetails[recLabel].details,
            ...type.childDetails,
          } as MethodChildDetail)
        : {
            label,
            description: ty.name,
          }
    }

    return {
      type: "recursive",
      label,
      childDetails: this.recDetails[recLabel].details,
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
      label,
      validate: validateError(t),
      field,
      defaultValue: [],
      childDetails: field.childDetails || [
        {
          label,
          description: ty.name,
        },
      ],
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
      label,
      field,
      validate: validateError(t),
      defaultValue: [],
      childDetails: field.childDetails || [
        {
          label,
          description: ty.name,
        },
      ],
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
      description: t.name,
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
