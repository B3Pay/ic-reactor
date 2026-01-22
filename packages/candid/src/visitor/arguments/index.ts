import { isQuery } from "../helpers"
import { IDL } from "../types"
import type {
  ArgumentField,
  RecordArgumentField,
  VariantArgumentField,
  TupleArgumentField,
  OptionalArgumentField,
  VectorArgumentField,
  BlobArgumentField,
  RecursiveArgumentField,
  PrincipalArgumentField,
  NumberArgumentField,
  BooleanArgumentField,
  NullArgumentField,
  TextArgumentField,
  UnknownArgumentField,
  MethodArgumentsMeta,
  ServiceArgumentsMeta,
} from "./types"
import { BaseActor, FunctionName } from "@ic-reactor/core"

export * from "./types"

/**
 * ArgumentFieldVisitor generates metadata for form input fields from Candid IDL types.
 *
 * ## Design Principles
 *
 * 1. **Works with raw IDL types** - generates metadata at initialization time
 * 2. **No value dependencies** - metadata is independent of actual values
 * 3. **Form-framework agnostic** - output can be used with TanStack, React Hook Form, etc.
 * 4. **Efficient** - single traversal, no runtime type checking
 *
 * ## Output Structure
 *
 * Each field has:
 * - `type`: The field type (record, variant, text, number, etc.)
 * - `label`: Human-readable label from Candid
 * - `path`: Dot-notation path for form binding (e.g., "0.owner")
 * - `defaultValue`: Initial value for the form
 * - Type-specific properties (options for variant, fields for record, etc.)
 *
 * @example
 * ```typescript
 * const visitor = new ArgumentFieldVisitor()
 * const serviceMeta = service.accept(visitor, null)
 *
 * // For a specific method
 * const methodMeta = serviceMeta["icrc1_transfer"]
 * // methodMeta.fields = [{ type: "record", fields: [...] }]
 * // methodMeta.defaultValues = [{ to: "", amount: "" }]
 * ```
 */
export class ArgumentFieldVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  ArgumentField | MethodArgumentsMeta<A> | ServiceArgumentsMeta<A>
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

  private childPath(key: string | number): string {
    const parent = this.currentPath()
    if (typeof key === "number") {
      return parent ? `${parent}[${key}]` : String(key)
    }
    return parent ? `${parent}.${key}` : key
  }

  // ════════════════════════════════════════════════════════════════════════
  // Service & Function Level
  // ════════════════════════════════════════════════════════════════════════

  public visitService(t: IDL.ServiceClass): ServiceArgumentsMeta<A> {
    const result = {} as ServiceArgumentsMeta<A>

    for (const [functionName, func] of t._fields) {
      result[functionName as FunctionName<A>] = func.accept(
        this,
        functionName
      ) as MethodArgumentsMeta<A>
    }

    return result
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): MethodArgumentsMeta<A> {
    const functionType = isQuery(t) ? "query" : "update"

    const fields = t.argTypes.map((arg, index) => {
      return this.withPath(`[${index}]`, () =>
        arg.accept(this, `__arg${index}`)
      ) as ArgumentField
    })

    const defaultValues = fields.map((field) => this.extractDefaultValue(field))

    return {
      functionType,
      functionName,
      fields,
      defaultValues,
    }
  }

  private extractDefaultValue(field: ArgumentField): unknown {
    if ("defaultValue" in field) {
      return field.defaultValue
    }
    if ("defaultValues" in field) {
      return field.defaultValues
    }
    return undefined
  }

  // ════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ════════════════════════════════════════════════════════════════════════

  public visitRecord(
    _t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): RecordArgumentField {
    const path = this.currentPath()
    const fields: ArgumentField[] = []
    const defaultValues: Record<string, unknown> = {}

    for (const [key, type] of fields_) {
      const field = this.withPath(this.childPath(key), () =>
        type.accept(this, key)
      ) as ArgumentField

      fields.push(field)
      defaultValues[key] = this.extractDefaultValue(field)
    }

    return {
      type: "record",
      label,
      path,
      fields,
      defaultValues,
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): VariantArgumentField {
    const path = this.currentPath()
    const fields: ArgumentField[] = []
    const options: string[] = []

    for (const [key, type] of fields_) {
      const field = this.withPath(this.childPath(key), () =>
        type.accept(this, key)
      ) as ArgumentField

      fields.push(field)
      options.push(key)
    }

    const defaultOption = options[0]
    const defaultValues = {
      [defaultOption]: this.extractDefaultValue(fields[0]),
    }

    return {
      type: "variant",
      label,
      path,
      fields,
      options,
      defaultOption,
      defaultValues,
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleArgumentField {
    const path = this.currentPath()
    const fields: ArgumentField[] = []
    const defaultValues: unknown[] = []

    for (let index = 0; index < components.length; index++) {
      const type = components[index]
      const field = this.withPath(this.childPath(index), () =>
        type.accept(this, `_${index}_`)
      ) as ArgumentField

      fields.push(field)
      defaultValues.push(this.extractDefaultValue(field))
    }

    return {
      type: "tuple",
      label,
      path,
      fields,
      defaultValues,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalArgumentField {
    const path = this.currentPath()

    const innerField = this.withPath(this.childPath(0), () =>
      ty.accept(this, label)
    ) as ArgumentField

    return {
      type: "optional",
      label,
      path,
      innerField,
      defaultValue: null,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): VectorArgumentField | BlobArgumentField {
    const path = this.currentPath()

    // Check if it's blob (vec nat8)
    const isBlob = ty instanceof IDL.FixedNatClass && ty._bits === 8

    const itemField = this.withPath(this.childPath(0), () =>
      ty.accept(this, label)
    ) as ArgumentField

    if (isBlob) {
      return {
        type: "blob",
        label,
        path,
        itemField,
        defaultValue: "",
      }
    }

    return {
      type: "vector",
      label,
      path,
      itemField,
      defaultValue: [],
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): RecursiveArgumentField {
    const path = this.currentPath()

    return {
      type: "recursive",
      label,
      path,
      // Lazy extraction to prevent infinite loops
      extract: () =>
        this.withPath(path, () => ty.accept(this, label)) as ArgumentField,
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    label: string
  ): PrincipalArgumentField {
    return {
      type: "principal",
      label,
      path: this.currentPath(),
      defaultValue: "",
      maxLength: 64,
      minLength: 7,
    }
  }

  public visitText(_t: IDL.TextClass, label: string): TextArgumentField {
    return {
      type: "text",
      label,
      path: this.currentPath(),
      defaultValue: "",
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): BooleanArgumentField {
    return {
      type: "boolean",
      label,
      path: this.currentPath(),
      defaultValue: false,
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): NullArgumentField {
    return {
      type: "null",
      label,
      path: this.currentPath(),
      defaultValue: null,
    }
  }

  // Numbers - all use string for display format
  private visitNumberType(
    label: string,
    candidType: string
  ): NumberArgumentField {
    return {
      type: "number",
      label,
      path: this.currentPath(),
      defaultValue: "",
      candidType,
    }
  }

  public visitInt(_t: IDL.IntClass, label: string): NumberArgumentField {
    return this.visitNumberType(label, "int")
  }

  public visitNat(_t: IDL.NatClass, label: string): NumberArgumentField {
    return this.visitNumberType(label, "nat")
  }

  public visitFloat(_t: IDL.FloatClass, label: string): NumberArgumentField {
    return this.visitNumberType(label, "float")
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    label: string
  ): NumberArgumentField {
    return this.visitNumberType(label, `int${t._bits}`)
  }

  public visitFixedNat(
    t: IDL.FixedNatClass,
    label: string
  ): NumberArgumentField {
    return this.visitNumberType(label, `nat${t._bits}`)
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): UnknownArgumentField {
    return {
      type: "unknown",
      label,
      path: this.currentPath(),
      defaultValue: undefined,
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Legacy Exports (for backward compatibility)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use ArgumentFieldVisitor instead
 */
export { ArgumentFieldVisitor as VisitTanstackField }

/**
 * @deprecated Use ArgumentField instead
 */
export type {
  ArgumentField as TanstackAllArgTypes,
  MethodArgumentsMeta as TanstackMethodField,
  ServiceArgumentsMeta as TanstackServiceField,
}
