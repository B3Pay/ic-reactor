import { IDL } from "@dfinity/candid"

import type {
  ArgTypeFromIDLType,
  DefaultArg,
  MethodArg,
  InputArg,
  NumberArg,
  PrincipalArg,
  OptionalArg,
  RecordArg,
  RecursiveArg,
  TupleArg,
  VariantArg,
  VectorArg,
  MethodArgsDefaultValues,
  DynamicArgTypeByClass,
  AllArgTypes,
  ServiceArg,
  BlobArg,
} from "./types"
import {
  extractAndSortArgs,
  isQuery,
  validateError,
  validateNumberError,
} from "../../helpers"
import type { BaseActor, FunctionName } from "../../types"

/**
 * Visit the candid file and extract the fields.
 * It returns the extracted service fields.
 *
 */
export class VisitArg<A = BaseActor> extends IDL.Visitor<
  string,
  MethodArg<A> | DefaultArg | ServiceArg<A>
> {
  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodArg<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const { fields, defaultValues } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, `__arg${index}`) as ArgTypeFromIDLType<
          typeof arg
        >

        acc.fields.push(field)

        acc.defaultValues[`arg${index}`] =
          field.defaultValue ?? field.defaultValues ?? {}

        return acc
      },
      {
        fields: [] as DynamicArgTypeByClass<IDL.Type>[],
        defaultValues: {} as MethodArgsDefaultValues<FunctionName<A>>,
      }
    )

    const validateAndReturnArgs = (
      data: MethodArgsDefaultValues<FunctionName<A>>
    ): ArgTypeFromIDLType<FunctionName<A>>[] => {
      const args = extractAndSortArgs(data)

      let errorMessages = ""

      const isValid = args.every((arg, i) => {
        const validationResponse = fields[i].validate(arg)

        if (typeof validationResponse === "string") {
          errorMessages = validationResponse
          return false
        }

        return true
      })

      if (isValid === true) {
        return args
      } else {
        throw new Error(errorMessages || "Failed to validate the arguments.")
      }
    }

    return {
      functionType,
      functionName,
      validateAndReturnArgs,
      defaultValues,
      fields,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): RecordArg<IDL.Type> {
    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllArgTypes<typeof type>

        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValue || field.defaultValues

        return acc
      },
      {
        fields: [] as AllArgTypes<IDL.Type>[],
        defaultValues: {} as Record<string, ArgTypeFromIDLType<IDL.Type>>,
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
  ): VariantArg<IDL.Type> {
    const { fields, options } = fields_.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key) as AllArgTypes<typeof type>

        acc.fields.push(field)
        acc.options.push(key)

        return acc
      },
      {
        fields: [] as AllArgTypes<IDL.Type>[],
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
  ): TupleArg<IDL.Type> {
    const { fields, defaultValues } = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, `_${index}_`) as AllArgTypes<
          typeof type
        >
        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValue || field.defaultValues)

        return acc
      },
      {
        fields: [] as AllArgTypes<IDL.Type>[],
        defaultValues: [] as ArgTypeFromIDLType<IDL.Type>[],
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
  ): RecursiveArg {
    return {
      type: "recursive",
      label,
      validate: validateError(t),
      name: ty.name,
      extract: () => ty.accept(this, label) as VariantArg<IDL.Type>,
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalArg {
    const field = ty.accept(this, label) as DynamicArgTypeByClass<typeof ty>

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
  ): VectorArg | BlobArg {
    const field = ty.accept(this, label) as DynamicArgTypeByClass<typeof ty>

    return {
      type: "_bits" in ty && ty._bits === 8 ? "blob" : "vector",
      field,
      validate: validateError(t),
      defaultValue: [],
      label,
    }
  }

  public visitType<T>(t: IDL.Type<T>, label: string): InputArg<IDL.Type<T>> {
    return {
      type: "unknown",
      validate: validateError(t),
      label,
      required: true,
      defaultValue: undefined as InputArg<IDL.Type<T>>["defaultValue"],
    }
  }

  public visitPrincipal(t: IDL.PrincipalClass, label: string): PrincipalArg {
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

  public visitBool(t: IDL.BoolClass, label: string): InputArg<typeof t> {
    return {
      type: "boolean",
      validate: validateError(t),
      label,
      required: true,
      defaultValue: false,
    }
  }

  public visitNull(t: IDL.NullClass, label: string): InputArg<typeof t> {
    return {
      type: "null",
      required: true,
      label,
      validate: validateError(t),
      defaultValue: null,
    }
  }

  public visitText(t: IDL.TextClass, label: string): InputArg<typeof t> {
    return {
      type: "text",
      validate: validateError(t),
      required: true,
      label,
      defaultValue: "",
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, label: string): NumberArg {
    return {
      type: "number",
      required: true,
      validate: validateNumberError(t),
      label,
      defaultValue: "",
    }
  }

  public visitInt(t: IDL.IntClass, label: string): NumberArg {
    return this.visitNumber(t, label)
  }

  public visitNat(t: IDL.NatClass, label: string): NumberArg {
    return this.visitNumber(t, label)
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberArg {
    return this.visitNumber(t, label)
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): NumberArg {
    return this.visitNumber(t, label)
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): NumberArg {
    return this.visitNumber(t, label)
  }

  public visitService(t: IDL.ServiceClass): ServiceArg<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = func.accept(this, functionName) as MethodArg<A>

      return acc
    }, {} as ServiceArg<A>)

    return methodFields
  }
}
