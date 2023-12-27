import { Principal } from "@dfinity/principal"
import { ExtractedField } from "./types"
import { IDL } from "@dfinity/candid"
export * from "./types"

export class UIExtract extends IDL.Visitor<string | undefined, ExtractedField> {
  public visitType<T>(t: IDL.Type<T>, l?: string): ExtractedField {
    return {
      component: "input",
      type: "text",
      validate: validateError(t.covariant),
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
      validate: validateError(t.covariant),
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
  public visitPrincipal(
    t: IDL.PrincipalClass,
    data: string | undefined
  ): ExtractedField {
    return {
      component: "input",
      type: "principal",
      validate: validateError(t.covariant),
      label: t.name,
      fields: [],
      defaultValues: data,
    }
  }
  public visitBool(t: IDL.BoolClass, l?: string): ExtractedField {
    return {
      component: "input",
      type: "checkbox",
      validate: validateError(t.covariant),
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
      validate: validateError(t.covariant),
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
        const field = this.visitType(type, key)
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
      validate: validateError(t.covariant),
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
        const field = this.visitType(type)
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
      validate: validateError(t.covariant),
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
        const field = this.visitType(type, label)

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
      validate: validateError(t.covariant),
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
      validate: validateError(t.covariant),
      label: l ?? t.name,
      fields: [this.visitType(ty)],
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
      validate: validateError(t.covariant),
      label: l ?? t.name,
      fields: [this.visitType(ty)],
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
      validate: validateError(t.covariant),
      extract: () => {
        const field = this.visitType(ty)
        field.fields = [field]
        return field
      },
      fields: [],
      defaultValues: undefined,
    }
  }
}

class Parse extends IDL.Visitor<string, any> {
  public visitNull(t: IDL.NullClass, v: string): null {
    return null
  }
  public visitBool(t: IDL.BoolClass, v: string): boolean {
    if (v === "true") {
      return true
    }
    if (v === "false") {
      return false
    }
    throw new Error(`Cannot parse ${v} as boolean`)
  }
  public visitText(t: IDL.TextClass, v: string): string {
    return v
  }
  public visitFloat(t: IDL.FloatClass, v: string): number {
    return parseFloat(v)
  }
  public visitFixedInt(t: IDL.FixedIntClass, v: string): number | bigint {
    if (t._bits <= 32) {
      return parseInt(v, 10)
    } else {
      return BigInt(v)
    }
  }
  public visitFixedNat(t: IDL.FixedNatClass, v: string): number | bigint {
    if (t._bits <= 32) {
      return parseInt(v, 10)
    } else {
      return BigInt(v)
    }
  }
  public visitNumber(t: IDL.PrimitiveType, v: string): bigint {
    return BigInt(v)
  }
  public visitPrincipal(t: IDL.PrincipalClass, v: string): Principal {
    return Principal.fromText(v)
  }
  public visitService(t: IDL.ServiceClass, v: string): Principal {
    return Principal.fromText(v)
  }
  public visitFunc(t: IDL.FuncClass, v: string): [Principal, string] {
    const x = v.split(".", 2)
    return [Principal.fromText(x[0]), x[1]]
  }
}
