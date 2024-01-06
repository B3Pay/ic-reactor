import type { ExtractedField } from "./types"
import { IDL } from "@dfinity/candid"
import { is_query, validateError } from "./helper"

export * from "./types"
export * from "./helper"

export class ExtractField extends IDL.Visitor<
  string | undefined,
  ExtractedField
> {
  public visitService(t: IDL.ServiceClass, l?: string): ExtractedField {
    return {
      component: "div",
      type: "service",
      validate: validateError(t),
      label: l ?? t.name,
      fields: t._fields.map(([methodName, method]) =>
        method.accept(this, methodName)
      ),
      defaultValues: undefined,
    }
  }

  public visitFunc(t: IDL.FuncClass, functionName: string): ExtractedField {
    const { fields, defaultValues } = t.argTypes.reduce(
      (acc, arg, index) => {
        const field = arg.accept(this, arg.name)
        acc.fields.push(field)
        acc.defaultValues.data[`${functionName}-arg${index}`] =
          field.defaultValues
        return acc
      },
      {
        fields: [] as ExtractedField[],
        defaultValues: { data: {} } as {
          data: { [K in `${typeof functionName}-arg${number}`]?: any }
        },
      }
    )

    return {
      component: "form",
      type: "function",
      validate: validateError(t),
      label: is_query(t) ? "query" : "update",
      fields,
      defaultValues,
    }
  }

  public visitType<T>(t: IDL.Type<T>, l?: string): ExtractedField {
    return {
      component: "span",
      type: "unknown",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [],
      defaultValues: undefined,
    }
  }

  public visitText(t: IDL.TextClass, l?: string): ExtractedField {
    return {
      component: "input",
      type: "text",
      validate: validateError(t),
      required: true,
      label: l ?? t.name,
      fields: [],
      defaultValues: "",
    }
  }

  public visitNumber<T>(t: IDL.Type<T>, l?: string): ExtractedField {
    return {
      component: "input",
      type: "number",
      valueAsNumber: true,
      required: true,
      validate: validateError(t),
      label: l ?? t.name,
      fields: [],
      defaultValues: undefined,
    }
  }

  public visitInt(t: IDL.IntClass, l?: string): ExtractedField {
    return this.visitNumber(t, l)
  }

  public visitNat(t: IDL.NatClass, l?: string): ExtractedField {
    return this.visitNumber(t, l)
  }

  public visitFloat(t: IDL.FloatClass, l?: string): ExtractedField {
    return this.visitNumber(t, l)
  }

  public visitFixedInt(t: IDL.FixedIntClass, l?: string): ExtractedField {
    return this.visitNumber(t, l)
  }

  public visitFixedNat(t: IDL.FixedNatClass, l?: string): ExtractedField {
    return this.visitNumber(t, l)
  }

  public visitPrincipal(t: IDL.PrincipalClass, l?: string): ExtractedField {
    return {
      component: "input",
      type: "principal",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [],
      defaultValues: undefined,
    }
  }

  public visitBool(t: IDL.BoolClass, l?: string): ExtractedField {
    return {
      component: "input",
      type: "checkbox",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [],
      defaultValues: false,
    }
  }

  public visitNull(t: IDL.NullClass, l?: string): ExtractedField {
    return {
      component: "span",
      type: "null",
      label: l ?? t.name,
      validate: validateError(t),
      fields: [],
      defaultValues: null,
    }
  }

  public visitRecord(
    t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    l?: string
  ): ExtractedField {
    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = type.accept(this, key)
        acc.fields.push(field)
        acc.defaultValues[key] = field.defaultValues
        return acc
      },
      {
        fields: [] as ExtractedField[],
        defaultValues: {} as Record<string, any>,
      }
    )

    return {
      component: "fieldset",
      type: "record",
      label: l ?? t.name,
      validate: validateError(t),
      fields,
      defaultValues,
    }
  }

  public visitTuple<T extends any[]>(
    t: IDL.TupleClass<T>,
    components: IDL.Type[],
    l?: string
  ): ExtractedField {
    const { fields, defaultValues } = components.reduce(
      (acc, type) => {
        const field = type.accept(this, null)
        acc.fields.push(field)
        acc.defaultValues.push(field.defaultValues)
        return acc
      },
      { fields: [] as ExtractedField[], defaultValues: [] as any[] }
    )

    return {
      component: "fieldset",
      type: "tuple",
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
  ): ExtractedField {
    const { fields, defaultValues, options } = _fields.reduce(
      (acc, [label, type]) => {
        const field = type.accept(this, label)

        acc.fields.push(field)
        acc.options.push(label)
        acc.defaultValues[label] = field.defaultValues

        return acc
      },
      {
        fields: [] as ExtractedField[],
        defaultValues: {} as Record<string, any>,
        options: [] as string[],
      }
    )

    return {
      component: "fieldset",
      type: "variant",
      fields,
      options,
      defaultValues,
      label: l ?? t.name,
      validate: validateError(t),
    }
  }

  public visitOpt<T>(
    t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    l?: string
  ): ExtractedField {
    return {
      component: "span",
      type: "optional",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [ty.accept(this, l)],
      defaultValues: [],
    }
  }

  public visitVec<T>(
    t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    l?: string
  ): ExtractedField {
    return {
      component: "span",
      type: "vector",
      validate: validateError(t),
      label: l ?? t.name,
      fields: [ty.accept(this, l)],
      defaultValues: [],
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    l?: string
  ): ExtractedField {
    return {
      component: "fieldset",
      type: "recursive",
      label: l ?? t.name,
      validate: validateError(t),
      extract: () => ty.accept(this, null),
      fields: [],
      defaultValues: undefined,
    }
  }
}
