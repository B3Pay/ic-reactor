import type {
  FieldTypeFromIDLType,
  DefaultField,
  MethodFields,
  InputField,
  NumberField,
  PrincipalField,
  OptionalFields,
  RecordFields,
  RecursiveFields,
  TupleFields,
  VariantFields,
  VectorFields,
  MethodDefaultValues,
  DynamicFieldTypeByClass,
  AllFieldTypes,
  ServiceFields,
  ServiceDefaultValues,
  BlobFields,
} from "./types"
import { isQuery, validateError, validateNumberError } from "../helper"
import { IDL } from "@dfinity/candid"
import type { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitFields<A = BaseActor> extends IDL.Visitor<
  string,
  MethodFields<A> | DefaultField | ServiceFields<A>
> {
  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodFields<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const { fields, defaultValue } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `arg${index}`) as FieldTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        acc.defaultValue[`arg${index}`] =
          field.defaultValue ?? field.defaultValues ?? {}

        return acc
      },
      {
        fields: [] as DynamicFieldTypeByClass<IDL.Type>[],
        defaultValue: {} as MethodDefaultValues<FunctionName<A>>,
      }
    )

    const defaultValues = {
      [functionName]: defaultValue,
    } as ServiceDefaultValues<A>

    return {
      functionType,
      functionName,
      validate: validateError(t),
      defaultValues,
      fields,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): RecordFields<IDL.Type> {
    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllFieldTypes<typeof type>

        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValue || field.defaultValues

        return acc
      },
      {
        fields: [] as AllFieldTypes<IDL.Type>[],
        defaultValues: {} as Record<string, FieldTypeFromIDLType<IDL.Type>>,
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

    const defaultValue = options[0]

    const defaultValues = {
      [defaultValue]: fields[0].defaultValue || fields[0].defaultValues || {},
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

  public visitTuple<T extends IDL.Type[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleFields<IDL.Type> {
    const { fields, defaultValues } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllFieldTypes<
          typeof type
        >
        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValue || field.defaultValues)

        return acc
      },
      {
        fields: [] as AllFieldTypes<IDL.Type>[],
        defaultValues: [] as FieldTypeFromIDLType<IDL.Type>[],
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
  ): RecursiveFields {
    return {
      type: "recursive",
      label,
      validate: validateError(t),
      name: ty.name,
      extract: () => ty.accept(this, label) as VariantFields<IDL.Type>,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalFields {
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
  ): VectorFields | BlobFields {
    const field = ty.accept(this, label) as DynamicFieldTypeByClass<typeof ty>

    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return {
        type: "blob",
        field,
        defaultValue: [],
        validate: validateError(t),
        label,
      }
    }

    return {
      type: "vector",
      field,
      validate: validateError(t),
      defaultValue: [],
      label,
    }
  }

  public visitType<T>(t: IDL.Type<T>, label: string): InputField<IDL.Type<T>> {
    return {
      type: "unknown",
      validate: validateError(t),
      label,
      required: true,
      defaultValue: undefined as InputField<IDL.Type<T>>["defaultValue"],
    }
  }

  public visitPrincipal(t: IDL.PrincipalClass, label: string): PrincipalField {
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

  public visitBool(t: IDL.BoolClass, label: string): InputField<typeof t> {
    return {
      type: "boolean",
      validate: validateError(t),
      label,
      required: true,
      defaultValue: false,
    }
  }

  public visitNull(t: IDL.NullClass, label: string): InputField<typeof t> {
    return {
      type: "null",
      required: true,
      label,
      validate: validateError(t),
      defaultValue: null,
    }
  }

  public visitText(t: IDL.TextClass, label: string): InputField<typeof t> {
    return {
      type: "text",
      validate: validateError(t),
      required: true,
      label,
      defaultValue: "",
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, label: string): NumberField {
    return {
      type: "number",
      required: true,
      validate: validateNumberError(t),
      label,
      defaultValue: "",
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
