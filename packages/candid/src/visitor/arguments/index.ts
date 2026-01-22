import { isQuery } from "../helpers"
import { IDL } from "../types"
import type {
  TanstackAllArgTypes,
  TanstackArgTypeFromIDLType,
  TanstackFieldProps,
  TanstackMethodField,
  TanstackServiceField,
  TanstackVariantArg,
  MethodArgsDefaultValues,
} from "./types"
import { VisitResultField } from "../returns"
import { ResultField } from "../returns/types"
import { BaseActor, FunctionName } from "@ic-reactor/core"

export * from "./types"

export class VisitTanstackField<A = BaseActor, V = unknown> extends IDL.Visitor<
  string,
  | TanstackMethodField<A>
  | TanstackAllArgTypes<IDL.Type>
  | TanstackServiceField<A>
> {
  private pathStack: string[] = []

  private withPath<T>(path: string, fn: () => T): T {
    this.pathStack.push(path)
    try {
      return fn()
    } finally {
      this.pathStack.pop()
    }
  }

  private currentPath(): string {
    return this.pathStack[this.pathStack.length - 1] ?? ""
  }

  private resolveDefaultValue(field: {
    defaultValue?: unknown
    defaultValues?: unknown
  }): unknown {
    if (typeof field.defaultValue !== "undefined") {
      return field.defaultValue
    }

    return field.defaultValues
  }

  private asField<T>(value: unknown): T {
    return value as T
  }

  private buildFieldProps(mode?: "value" | "array"): TanstackFieldProps {
    const name = this.currentPath()

    return {
      name,
      ...(mode ? { mode } : {}),
    }
  }

  private childPath(key: string | number): string {
    const parent = this.currentPath()
    // Use bracket notation for numeric indices (TanStack Form array format)
    if (typeof key === "number") {
      return parent ? `${parent}[${key}]` : String(key)
    }
    return parent ? `${parent}.${key}` : key
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): TanstackMethodField<A> {
    const functionType = isQuery(t) ? "query" : "update"

    // Generate input argument fields (for form rendering)
    const fields = t.argTypes.map((arg, index) => {
      return this.asField<TanstackAllArgTypes<IDL.Type>>(
        this.withPath(`[${index}]`, () => arg.accept(this, `__arg${index}`))
      )
    })
    const defaultValues = fields.map(
      (field) => this.resolveDefaultValue(field) ?? {}
    ) as MethodArgsDefaultValues<FunctionName<A>>

    // Generate result fields using the lean result visitor (for display rendering)
    const resultVisitor = new VisitResultField<A, V>()

    const generateField = (data: unknown) => {
      const results = Array.isArray(data)
        ? data
        : t.retTypes.length > 1
          ? [data]
          : [data]

      return t.retTypes.map((retType, index) => {
        let actualType = retType
        let actualValue = results[index]

        // Unwrap Result types (Ok/Err) at the retType level
        if (retType instanceof IDL.VariantClass) {
          const fields = retType._fields
          const options = fields.map(([key]) => key)

          if (
            options.length === 2 &&
            options.includes("Ok") &&
            options.includes("Err")
          ) {
            const okField = fields.find(([key]) => key === "Ok")
            if (okField && actualValue !== null && actualValue !== undefined) {
              if (typeof actualValue === "object" && actualValue !== null) {
                if ("Ok" in actualValue) {
                  // Explicit Ok: unwrap to inner type and value
                  actualType = okField[1]
                  actualValue = actualValue.Ok
                } else if ("Err" in actualValue) {
                  // Err case: keep as variant to show error
                  // Don't unwrap, let visitor handle it
                } else {
                  // Implicit unwrap: object exists but not wrapped in {Ok:...} or {Err:...}
                  // This means CandidDisplayReactor already unwrapped the Result
                  actualType = okField[1]
                  // actualValue is already the unwrapped value
                }
              } else {
                // Implicit unwrap: primitive value (not an object)
                actualType = okField[1]
              }
            } else if (
              okField &&
              (actualValue === null || actualValue === undefined)
            ) {
              // No value yet, default to Ok type
              actualType = okField[1]
            }
          }
        }

        return actualType.accept(resultVisitor, {
          label: `__ret${index}`,
          value: actualValue,
        }) as ResultField
      })
    }

    return {
      functionType,
      functionName,
      defaultValues,
      fields,
      generateField,
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    _fields: Array<[string, IDL.Type]>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    const { fields, defaultValues } = _fields.reduce(
      (acc, [key, type]) => {
        const field = this.asField<TanstackAllArgTypes<typeof type>>(
          this.withPath(this.childPath(key), () => type.accept(this, key))
        )

        acc.fields.push(field)
        acc.defaultValues[key] =
          (field as { defaultValue?: unknown; defaultValues?: unknown })
            .defaultValue ??
          (field as { defaultValues?: unknown }).defaultValues

        return acc
      },
      {
        fields: [] as TanstackAllArgTypes<IDL.Type>[],
        defaultValues: {} as Record<
          string,
          TanstackArgTypeFromIDLType<IDL.Type>
        >,
      }
    )

    return {
      type: "record" as const,
      label,
      name,
      fields,
      defaultValues,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    const { fields, options } = fields_.reduce(
      (acc, [key, type]) => {
        const field = this.asField<TanstackAllArgTypes<typeof type>>(
          this.withPath(this.childPath(key), () => type.accept(this, key))
        )

        acc.fields.push(field)
        acc.options.push(key)

        return acc
      },
      {
        fields: [] as TanstackAllArgTypes<IDL.Type>[],
        options: [] as string[],
      }
    )

    const defaultValue = options[0]

    const defaultValues = {
      [defaultValue]:
        (fields[0] as { defaultValue?: unknown; defaultValues?: unknown })
          .defaultValue ??
        (fields[0] as { defaultValues?: unknown }).defaultValues ??
        {},
    }

    return {
      type: "variant" as const,
      fields,
      options,
      label,
      name,
      defaultValue,
      defaultValues,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    const { fields, defaultValues } = components.reduce(
      (acc, type, index) => {
        const field = this.asField<TanstackAllArgTypes<typeof type>>(
          this.withPath(this.childPath(index), () =>
            type.accept(this, `_${index}_`)
          )
        )

        acc.fields.push(field)
        acc.defaultValues.push(
          (field as { defaultValue?: unknown; defaultValues?: unknown })
            .defaultValue ??
            (field as { defaultValues?: unknown }).defaultValues
        )

        return acc
      },
      {
        fields: [] as TanstackAllArgTypes<IDL.Type>[],
        defaultValues: [] as TanstackArgTypeFromIDLType<IDL.Type>[],
      }
    )

    return {
      type: "tuple" as const,
      fields,
      label,
      name,
      defaultValues,
      fieldProps: this.buildFieldProps("array"),
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "recursive" as const,
      label,
      name,
      extract: () =>
        this.withPath(name, () =>
          ty.accept(this, label)
        ) as unknown as TanstackVariantArg<IDL.Type>,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    const field = this.asField<TanstackAllArgTypes<typeof ty>>(
      this.withPath(this.childPath(0), () => ty.accept(this, label))
    )

    return {
      type: "optional" as const,
      field,
      defaultValue: null,
      label,
      name,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    const field = this.asField<TanstackAllArgTypes<typeof ty>>(
      this.withPath(this.childPath(0), () => ty.accept(this, label))
    )

    const isBlob = "_bits" in ty && ty._bits === 8

    return isBlob
      ? {
          type: "blob" as const,
          field,
          defaultValue: "",
          label,
          name,
          fieldProps: this.buildFieldProps(),
        }
      : {
          type: "vector" as const,
          field,
          defaultValue: [],
          label,
          name,
          fieldProps: this.buildFieldProps("array"),
        }
  }

  public visitType<T>(
    _t: IDL.Type<T>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "unknown" as const,
      label,
      name,
      defaultValue: undefined as TanstackArgTypeFromIDLType<IDL.Type>,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "principal" as const,
      maxLength: 64,
      minLength: 7,
      label,
      name,
      required: true as const,
      defaultValue: "",
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitBool(
    _t: IDL.BoolClass,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "boolean" as const,
      label,
      name,
      required: true as const,
      defaultValue: false,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitNull(
    _t: IDL.NullClass,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "null" as const,
      label,
      name,
      defaultValue: null,
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitText(
    _t: IDL.TextClass,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "text" as const,
      required: true as const,
      label,
      name,
      defaultValue: "",
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitNumber<T>(
    _t: IDL.Type<T>,
    label: string
  ): TanstackAllArgTypes<IDL.Type> {
    const name = this.currentPath()

    return {
      type: "number" as const,
      required: true as const,
      label,
      name,
      defaultValue: "",
      fieldProps: this.buildFieldProps(),
    }
  }

  public visitInt(t: IDL.IntClass, label: string) {
    return this.visitNumber(t, label)
  }

  public visitNat(t: IDL.NatClass, label: string) {
    return this.visitNumber(t, label)
  }

  public visitFloat(t: IDL.FloatClass, label: string) {
    return this.visitNumber(t, label)
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string) {
    return this.visitNumber(t, label)
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string) {
    return this.visitNumber(t, label)
  }

  public visitService(t: IDL.ServiceClass): TanstackServiceField<A> {
    const methodFields = t._fields.reduce((acc, services) => {
      const functionName = services[0] as FunctionName<A>
      const func = services[1]

      acc[functionName] = this.asField<TanstackMethodField<A>>(
        func.accept(this, functionName)
      )

      return acc
    }, {} as TanstackServiceField<A>)

    return methodFields
  }
}
