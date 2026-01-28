import { isQuery } from "../helpers"
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

import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { BaseActor, FunctionName } from "@ic-reactor/core"
import * as z from "zod"

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
 * 5. **TanStack Form optimized** - name paths compatible with TanStack Form patterns
 *
 * ## Output Structure
 *
 * Each field has:
 * - `type`: The field type (record, variant, text, number, etc.)
 * - `label`: Human-readable label from Candid
 * - `name`: TanStack Form compatible path (e.g., "[0]", "[0].owner", "tags[1]")
 * - `defaultValue`: Initial value for the form
 * - `schema`: Zod schema for validation
 * - Type-specific properties (options for variant, fields for record, etc.)
 * - Helper methods for dynamic forms (getOptionDefault, getItemDefault, etc.)
 *
 * ## Usage with TanStack Form
 *
 * @example
 * ```typescript
 * import { useForm } from '@tanstack/react-form'
 * import { ArgumentFieldVisitor } from '@ic-reactor/candid'
 *
 * const visitor = new ArgumentFieldVisitor()
 * const serviceMeta = service.accept(visitor, null)
 * const methodMeta = serviceMeta["icrc1_transfer"]
 *
 * const form = useForm({
 *   defaultValues: methodMeta.defaultValue,
 *   validators: { onBlur: methodMeta.schema },
 *   onSubmit: async ({ value }) => {
 *     await actor.icrc1_transfer(...value)
 *   }
 * })
 *
 * // Render fields dynamically
 * methodMeta.fields.map((field, index) => (
 *   <form.Field key={index} name={field.name}>
 *     {(fieldApi) => <DynamicInput field={field} fieldApi={fieldApi} />}
 *   </form.Field>
 * ))
 * ```
 */
export class ArgumentFieldVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  ArgumentField | MethodArgumentsMeta<A> | ServiceArgumentsMeta<A>
> {
  public recursiveSchemas: Map<string, z.ZodTypeAny> = new Map()

  private nameStack: string[] = []

  /**
   * Execute function with a name segment pushed onto the stack.
   * Automatically manages stack cleanup.
   */
  private withName<T>(name: string, fn: () => T): T {
    this.nameStack.push(name)
    try {
      return fn()
    } finally {
      this.nameStack.pop()
    }
  }

  /**
   * Get the current full name path for form binding.
   * Returns empty string for root level.
   */
  private currentName(): string {
    return this.nameStack.join("")
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
    const argCount = t.argTypes.length

    const fields = t.argTypes.map((arg, index) => {
      return this.withName(`[${index}]`, () =>
        arg.accept(this, `__arg${index}`)
      ) as ArgumentField
    })

    const defaultValue = fields.map((field) => field.defaultValue)

    // Handle empty args case for schema
    // For no-arg functions, use an empty array schema
    // For functions with args, use a proper tuple schema
    const schema =
      argCount === 0
        ? (z.tuple([]) as unknown as z.ZodTuple<
            [z.ZodTypeAny, ...z.ZodTypeAny[]]
          >)
        : z.tuple(
            fields.map((field) => field.schema) as [
              z.ZodTypeAny,
              ...z.ZodTypeAny[],
            ]
          )

    return {
      functionType,
      functionName,
      fields,
      defaultValue,
      schema,
      argCount,
      isNoArgs: argCount === 0,
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ════════════════════════════════════════════════════════════════════════

  public visitRecord(
    _t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): RecordArgumentField {
    const name = this.currentName()
    const fields: ArgumentField[] = []
    const fieldMap = new Map<string, ArgumentField>()
    const defaultValue: Record<string, unknown> = {}
    const schemaShape: Record<string, z.ZodTypeAny> = {}

    for (const [key, type] of fields_) {
      const field = this.withName(name ? `.${key}` : key, () =>
        type.accept(this, key)
      ) as ArgumentField

      fields.push(field)
      fieldMap.set(key, field)
      defaultValue[key] = field.defaultValue
      schemaShape[key] = field.schema
    }

    const schema = z.object(schemaShape)

    return {
      type: "record",
      label,
      name,
      fields,
      fieldMap,
      defaultValue,
      schema,
      candidType: "record",
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): VariantArgumentField {
    const name = this.currentName()
    const fields: ArgumentField[] = []
    const options: string[] = []
    const optionMap = new Map<string, ArgumentField>()
    const variantSchemas: z.ZodTypeAny[] = []

    for (const [key, type] of fields_) {
      const field = this.withName(`.${key}`, () =>
        type.accept(this, key)
      ) as ArgumentField

      fields.push(field)
      options.push(key)
      optionMap.set(key, field)
      variantSchemas.push(z.object({ [key]: field.schema }))
    }

    const defaultOption = options[0]
    const firstField = fields[0]
    const defaultValue = {
      [defaultOption]: firstField.defaultValue,
    }

    const schema = z.union(variantSchemas as [z.ZodTypeAny, ...z.ZodTypeAny[]])

    // Helper to get default value for any option
    const getOptionDefault = (option: string): Record<string, unknown> => {
      const optField = optionMap.get(option)
      if (!optField) {
        throw new Error(`Unknown variant option: ${option}`)
      }
      return { [option]: optField.defaultValue }
    }

    return {
      type: "variant",
      label,
      name,
      fields,
      options,
      defaultOption,
      optionMap,
      defaultValue,
      schema,
      getOptionDefault,
      candidType: "variant",
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleArgumentField {
    const name = this.currentName()
    const fields: ArgumentField[] = []
    const defaultValue: unknown[] = []
    const schemas: z.ZodTypeAny[] = []

    for (let index = 0; index < components.length; index++) {
      const type = components[index]
      const field = this.withName(`[${index}]`, () =>
        type.accept(this, `_${index}_`)
      ) as ArgumentField

      fields.push(field)
      defaultValue.push(field.defaultValue)
      schemas.push(field.schema)
    }

    const schema = z.tuple(schemas as [z.ZodTypeAny, ...z.ZodTypeAny[]])

    return {
      type: "tuple",
      label,
      name,
      fields,
      defaultValue,
      schema,
      candidType: "tuple",
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): OptionalArgumentField {
    const name = this.currentName()

    // For optional, the inner field keeps the same name path
    // because the value replaces null directly (not nested)
    const innerField = ty.accept(this, label) as ArgumentField

    const schema = innerField.schema.nullish().transform((v) => v ?? null)

    // Helper to get the inner default when enabling the optional
    const getInnerDefault = (): unknown => innerField.defaultValue

    return {
      type: "optional",
      label,
      name,
      innerField,
      defaultValue: null,
      schema,
      getInnerDefault,
      candidType: "opt",
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): VectorArgumentField | BlobArgumentField {
    const name = this.currentName()

    // Check if it's blob (vec nat8)
    const isBlob = ty instanceof IDL.FixedNatClass && ty._bits === 8

    // Item field uses [0] as template path
    const itemField = this.withName("[0]", () =>
      ty.accept(this, `${label}_item`)
    ) as ArgumentField

    if (isBlob) {
      const schema = z.union([
        z.string(),
        z.array(z.number()),
        z.instanceof(Uint8Array),
      ])
      return {
        type: "blob",
        label,
        name,
        itemField,
        defaultValue: "",
        schema,
        acceptedFormats: ["hex", "base64", "file"],
        candidType: "blob",
      }
    }

    const schema = z.array(itemField.schema)

    // Helper to get a new item with default values
    const getItemDefault = (): unknown => itemField.defaultValue

    return {
      type: "vector",
      label,
      name,
      itemField,
      defaultValue: [],
      schema,
      getItemDefault,
      candidType: "vec",
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): RecursiveArgumentField {
    const name = this.currentName()
    const typeName = ty.name || "RecursiveType"

    let schema: z.ZodTypeAny

    if (this.recursiveSchemas.has(typeName)) {
      schema = this.recursiveSchemas.get(typeName)!
    } else {
      schema = z.lazy(() => (ty.accept(this, label) as ArgumentField).schema)
      this.recursiveSchemas.set(typeName, schema)
    }

    // Lazy extraction to prevent infinite loops
    const extract = (): ArgumentField =>
      this.withName(name, () => ty.accept(this, label)) as ArgumentField

    // Helper to get inner default (evaluates lazily)
    const getInnerDefault = (): unknown => extract().defaultValue

    return {
      type: "recursive",
      label,
      name,
      typeName,
      extract,
      defaultValue: undefined,
      schema,
      getInnerDefault,
      candidType: "rec",
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  public visitPrincipal(
    _t: IDL.PrincipalClass,
    label: string
  ): PrincipalArgumentField {
    const schema = z.custom<Principal>(
      (val) => {
        if (val instanceof Principal) return true
        if (typeof val === "string") {
          if (val === "") return true // Allow empty for optional cases
          try {
            Principal.fromText(val)
            return true
          } catch {
            return false
          }
        }
        return false
      },
      {
        message: "Invalid Principal format",
      }
    )

    return {
      type: "principal",
      label,
      name: this.currentName(),
      defaultValue: "",
      maxLength: 64,
      minLength: 7,
      schema,
      candidType: "principal",
      ui: {
        placeholder: "aaaaa-aa or full principal ID",
      },
    }
  }

  public visitText(_t: IDL.TextClass, label: string): TextArgumentField {
    return {
      type: "text",
      label,
      name: this.currentName(),
      defaultValue: "",
      schema: z.string(),
      candidType: "text",
      ui: {
        placeholder: "Enter text...",
      },
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): BooleanArgumentField {
    return {
      type: "boolean",
      label,
      name: this.currentName(),
      defaultValue: false,
      schema: z.boolean(),
      candidType: "bool",
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): NullArgumentField {
    return {
      type: "null",
      label,
      name: this.currentName(),
      defaultValue: null,
      schema: z.null(),
      candidType: "null",
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Number Types with Constraints
  // ════════════════════════════════════════════════════════════════════════

  private visitNumberType(
    label: string,
    candidType: string,
    options: {
      unsigned: boolean
      isFloat: boolean
      bits?: number
      min?: string
      max?: string
    }
  ): NumberArgumentField {
    return {
      type: "number",
      label,
      name: this.currentName(),
      defaultValue: "",
      candidType,
      schema: z.string(),
      ...options,
      ui: {
        placeholder: options.isFloat ? "0.0" : "0",
      },
    }
  }

  public visitInt(_t: IDL.IntClass, label: string): NumberArgumentField {
    return this.visitNumberType(label, "int", {
      unsigned: false,
      isFloat: false,
    })
  }

  public visitNat(_t: IDL.NatClass, label: string): NumberArgumentField {
    return this.visitNumberType(label, "nat", {
      unsigned: true,
      isFloat: false,
    })
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberArgumentField {
    return this.visitNumberType(label, `float${t._bits}`, {
      unsigned: false,
      isFloat: true,
      bits: t._bits,
    })
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    label: string
  ): NumberArgumentField {
    const bits = t._bits
    // Calculate min/max for signed integers
    const max = (BigInt(2) ** BigInt(bits - 1) - BigInt(1)).toString()
    const min = (-(BigInt(2) ** BigInt(bits - 1))).toString()

    return this.visitNumberType(label, `int${bits}`, {
      unsigned: false,
      isFloat: false,
      bits,
      min,
      max,
    })
  }

  public visitFixedNat(
    t: IDL.FixedNatClass,
    label: string
  ): NumberArgumentField {
    const bits = t._bits
    // Calculate max for unsigned integers
    const max = (BigInt(2) ** BigInt(bits) - BigInt(1)).toString()

    return this.visitNumberType(label, `nat${bits}`, {
      unsigned: true,
      isFloat: false,
      bits,
      min: "0",
      max,
    })
  }

  public visitType<T>(_t: IDL.Type<T>, label: string): UnknownArgumentField {
    return {
      type: "unknown",
      label,
      name: this.currentName(),
      defaultValue: undefined,
      schema: z.any(),
    }
  }
}
