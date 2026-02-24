import { isQuery } from "../helpers"
import { checkTextFormat, checkNumberFormat } from "../constants"
import { MetadataError } from "./types"
import type {
  FieldNode,
  RecordField,
  VariantField,
  TupleField,
  OptionalField,
  VectorField,
  BlobField,
  RecursiveField,
  PrincipalField,
  NumberField,
  BooleanField,
  NullField,
  TextField,
  UnknownField,
  ArgumentsMeta,
  ArgumentsServiceMeta,
  RenderHint,
  PrimitiveInputProps,
  BlobLimits,
  BlobValidationResult,
  TextFormat,
  NumberFormat,
} from "./types"

import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { BaseActor, FunctionName } from "@ic-reactor/core"
import * as z from "zod"
import { formatLabel } from "./helpers"

export * from "./types"
export * from "./helpers"
export { checkTextFormat, checkNumberFormat } from "../constants"

// ════════════════════════════════════════════════════════════════════════════
// Render Hint Helpers
// ════════════════════════════════════════════════════════════════════════════

const COMPOUND_RENDER_HINT: RenderHint = {
  isCompound: true,
  isPrimitive: false,
}

const TEXT_RENDER_HINT: RenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "text",
}

const NUMBER_RENDER_HINT: RenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "number",
}

const CHECKBOX_RENDER_HINT: RenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "checkbox",
}

const FILE_RENDER_HINT: RenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "file",
}

// ════════════════════════════════════════════════════════════════════════════
// Blob Field Helpers
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_BLOB_LIMITS: BlobLimits = {
  maxHexBytes: 512,
  maxFileBytes: 2 * 1024 * 1024, // 2MB
  maxHexDisplayLength: 128,
}

function normalizeHex(input: string): string {
  // Remove 0x prefix and convert to lowercase
  let hex = input.toLowerCase()
  if (hex.startsWith("0x")) {
    hex = hex.slice(2)
  }
  // Remove any whitespace
  hex = hex.replace(/\s/g, "")
  return hex
}

function validateBlobInput(
  value: string | Uint8Array,
  limits: BlobLimits
): BlobValidationResult {
  if (value instanceof Uint8Array) {
    if (value.length > limits.maxFileBytes) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${limits.maxFileBytes} bytes`,
      }
    }
    return { valid: true }
  }

  // String input (hex)
  const normalized = normalizeHex(value)
  if (normalized.length === 0) {
    return { valid: true } // Empty is valid
  }

  if (!/^[0-9a-f]*$/.test(normalized)) {
    return { valid: false, error: "Invalid hex characters" }
  }

  if (normalized.length % 2 !== 0) {
    return { valid: false, error: "Hex string must have even length" }
  }

  const byteLength = normalized.length / 2
  if (byteLength > limits.maxHexBytes) {
    return {
      valid: false,
      error: `Hex input exceeds maximum of ${limits.maxHexBytes} bytes`,
    }
  }

  return { valid: true }
}

/**
 * FieldVisitor generates metadata for form input fields from Candid IDL types.
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
 * - `label`: Raw label from Candid
 * - `displayLabel`: Human-readable formatted label
 * - `name`: TanStack Form compatible path (e.g., "[0]", "[0].owner", "tags[1]")
 * - `component`: Suggested component type for rendering
 * - `renderHint`: Hints for UI rendering strategy
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
 * import { FieldVisitor } from '@ic-reactor/candid'
 *
 * const visitor = new FieldVisitor()
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
export class FieldVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  FieldNode | ArgumentsMeta<A> | ArgumentsServiceMeta<A>
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

  public visitService(t: IDL.ServiceClass): ArgumentsServiceMeta<A> {
    const result = {} as ArgumentsServiceMeta<A>

    for (const [functionName, func] of t._fields) {
      result[functionName as FunctionName<A>] = func.accept(
        this,
        functionName
      ) as ArgumentsMeta<A>
    }

    return result
  }

  public visitFunc(
    t: IDL.FuncClass,
    functionName: FunctionName<A>
  ): ArgumentsMeta<A> {
    const functionType = isQuery(t) ? "query" : "update"
    const argCount = t.argTypes.length

    const args = t.argTypes.map((arg, index) => {
      return this.withName(`[${index}]`, () =>
        arg.accept(this, `__arg${index}`)
      ) as FieldNode
    })

    const defaults = args.map((field) => field.defaultValue)

    // Handle empty args case for schema
    // For no-arg functions, use an empty array schema
    // For functions with args, use a proper tuple schema
    const schema =
      argCount === 0
        ? (z.tuple([]) as unknown as z.ZodTuple<
            [z.ZodTypeAny, ...z.ZodTypeAny[]]
          >)
        : z.tuple(
            args.map((field) => field.schema) as [
              z.ZodTypeAny,
              ...z.ZodTypeAny[],
            ]
          )

    return {
      candidType: t.name,
      functionType,
      functionName,
      args,
      defaults,
      schema,
      argCount,
      isEmpty: argCount === 0,
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ════════════════════════════════════════════════════════════════════════

  public visitRecord(
    _t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): RecordField {
    const name = this.currentName()
    const fields: FieldNode[] = []
    const defaultValue: Record<string, unknown> = {}
    const schemaShape: Record<string, z.ZodTypeAny> = {}

    for (const [key, type] of fields_) {
      const field = this.withName(name ? `.${key}` : key, () =>
        type.accept(this, key)
      ) as FieldNode

      fields.push(field)
      defaultValue[key] = field.defaultValue
      schemaShape[key] = field.schema
    }

    const schema = z.object(schemaShape)

    return {
      type: "record",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "record-container",
      renderHint: COMPOUND_RENDER_HINT,
      fields,
      defaultValue,
      schema,
      candidType: "record",
    }
  }

  public visitVariant(
    _t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): VariantField {
    const name = this.currentName()
    const options: FieldNode[] = []
    const variantSchemas: z.ZodTypeAny[] = []

    for (const [key, type] of fields_) {
      const field = this.withName(`.${key}`, () =>
        type.accept(this, key)
      ) as FieldNode

      options.push(field)

      if (field.type === "null") {
        variantSchemas.push(z.object({ _type: z.literal(key) }))
      } else {
        variantSchemas.push(
          z.object({
            _type: z.literal(key),
            [key]: field.schema,
          })
        )
      }
    }

    const firstOption = options[0]
    const defaultOption = firstOption.label

    const defaultValue =
      firstOption.type === "null"
        ? { _type: defaultOption }
        : {
            _type: defaultOption,
            [defaultOption]: firstOption.defaultValue,
          }

    const schema = z.union(variantSchemas as [z.ZodTypeAny, ...z.ZodTypeAny[]])

    // Helper to get default value for any option
    const getOptionDefault = (option: string): Record<string, unknown> => {
      const optField = options.find((f) => f.label === option)
      if (!optField) {
        throw new MetadataError(
          `Unknown variant option: "${option}". Available: ${options.map((o) => o.label).join(", ")}`,
          name,
          "variant"
        )
      }
      return optField.type === "null"
        ? { _type: option }
        : { _type: option, [option]: optField.defaultValue }
    }

    // Helper to get field for a specific option
    const getOption = (option: string): FieldNode => {
      const optField = options.find((f) => f.label === option)
      if (!optField) {
        throw new MetadataError(
          `Unknown variant option: "${option}". Available: ${options.map((o) => o.label).join(", ")}`,
          name,
          "variant"
        )
      }
      return optField
    }

    // Helper to get currently selected option key from a value
    const getSelectedKey = (value: Record<string, unknown>): string => {
      if (value._type && typeof value._type === "string") {
        return value._type
      }
      const validKeys = Object.keys(value).filter((k) =>
        options.some((f) => f.label === k)
      )
      return validKeys[0] ?? defaultOption
    }

    // Helper to get the field for the currently selected option
    const getSelectedOption = (value: Record<string, unknown>): FieldNode => {
      const selectedKey = getSelectedKey(value)
      return getOption(selectedKey)
    }

    return {
      type: "variant",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "variant-select",
      renderHint: COMPOUND_RENDER_HINT,
      options,
      defaultOption,
      defaultValue,
      schema,
      getOptionDefault,
      getOption,
      getSelectedKey,
      getSelectedOption,
      candidType: "variant",
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): TupleField {
    const name = this.currentName()
    const fields: FieldNode[] = []
    const defaultValue: unknown[] = []
    const schemas: z.ZodTypeAny[] = []

    for (let index = 0; index < components.length; index++) {
      const type = components[index]
      const field = this.withName(`[${index}]`, () =>
        type.accept(this, `_${index}_`)
      ) as FieldNode

      fields.push(field)
      defaultValue.push(field.defaultValue)
      schemas.push(field.schema)
    }

    const schema = z.tuple(schemas as [z.ZodTypeAny, ...z.ZodTypeAny[]])

    return {
      type: "tuple",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "tuple-container",
      renderHint: COMPOUND_RENDER_HINT,
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
  ): OptionalField {
    const name = this.currentName()

    // For optional, the inner field keeps the same name path
    // because the value replaces null directly (not nested)
    const innerField = ty.accept(this, label) as FieldNode

    const schema = z.union([
      innerField.schema,
      z.null(),
      z.undefined().transform(() => null),
    ])

    // Helper to get the inner default when enabling the optional
    const getInnerDefault = (): unknown => innerField.defaultValue

    // Helper to check if a value represents an enabled optional
    const isEnabled = (value: unknown): boolean => {
      return value !== null && typeof value !== "undefined"
    }

    return {
      type: "optional",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "optional-toggle",
      renderHint: COMPOUND_RENDER_HINT,
      innerField,
      defaultValue: null,
      schema,
      getInnerDefault,
      isEnabled,
      candidType: "opt",
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): VectorField | BlobField {
    const name = this.currentName()

    // Check if it's blob (vec nat8)
    const isBlob = ty instanceof IDL.FixedNatClass && ty._bits === 8

    // Item field uses [0] as template path
    const itemField = this.withName("[0]", () =>
      ty.accept(this, `${label}_item`)
    ) as FieldNode

    if (isBlob) {
      const schema = z.union([
        z.string(),
        z.array(z.number()),
        z.instanceof(Uint8Array),
      ])

      const limits = { ...DEFAULT_BLOB_LIMITS }

      return {
        type: "blob",
        label,
        displayLabel: formatLabel(label),
        name,
        component: "blob-upload",
        renderHint: FILE_RENDER_HINT,
        itemField,
        defaultValue: "",
        schema,
        acceptedFormats: ["hex", "base64", "file"],
        limits,
        normalizeHex,
        validateInput: (value: string | Uint8Array) =>
          validateBlobInput(value, limits),
        candidType: "blob",
      }
    }

    const schema = z.array(itemField.schema)

    // Helper to get a new item with default values
    const getItemDefault = (): unknown => itemField.defaultValue

    // Helper to create an item field for a specific index
    const createItemField = (
      index: number,
      overrides?: { label?: string }
    ): FieldNode => {
      // Replace [0] in template with actual index
      const itemName = name ? `${name}[${index}]` : `[${index}]`
      const itemLabel = overrides?.label ?? `Item ${index}`

      return {
        ...itemField,
        name: itemName,
        label: itemLabel,
        displayLabel: formatLabel(itemLabel),
      }
    }

    return {
      type: "vector",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "vector-list",
      renderHint: COMPOUND_RENDER_HINT,
      itemField,
      defaultValue: [],
      schema,
      getItemDefault,
      createItemField,
      candidType: "vec",
    }
  }

  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): RecursiveField {
    const name = this.currentName()
    const typeName = ty.name || "RecursiveType"

    let schema: z.ZodTypeAny

    if (this.recursiveSchemas.has(typeName)) {
      schema = this.recursiveSchemas.get(typeName)!
    } else {
      schema = z.lazy(() => (ty.accept(this, label) as FieldNode).schema)
      this.recursiveSchemas.set(typeName, schema)
    }

    // Lazy extraction to prevent infinite loops
    const extract = (): FieldNode =>
      this.withName(name, () => ty.accept(this, label)) as FieldNode

    // Helper to get inner default (evaluates lazily)
    const getInnerDefault = (): unknown => extract().defaultValue

    return {
      type: "recursive",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "recursive-lazy",
      renderHint: COMPOUND_RENDER_HINT,
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

  public visitPrincipal(_t: IDL.PrincipalClass, label: string): PrincipalField {
    const schema = z.custom<Principal>(
      (val) => {
        if (val instanceof Principal) return true
        if (typeof val === "string") {
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

    const inputProps: PrimitiveInputProps = {
      type: "text",
      placeholder: "aaaaa-aa or full principal ID",
      minLength: 7,
      maxLength: 64,
      spellCheck: false,
      autoComplete: "off",
    }

    return {
      type: "principal",
      label,
      displayLabel: formatLabel(label),
      name: this.currentName(),
      component: "principal-input",
      renderHint: TEXT_RENDER_HINT,
      defaultValue: "",
      maxLength: 64,
      minLength: 7,
      format: checkTextFormat(label) as TextFormat,
      schema,
      inputProps,
      candidType: "principal",
    }
  }

  public visitText(_t: IDL.TextClass, label: string): TextField {
    const format = checkTextFormat(label) as TextFormat

    // Generate format-specific inputProps
    const inputProps = this.getTextInputProps(format)

    // Generate format-specific schema
    const schema = this.getTextSchema(format)

    return {
      type: "text",
      label,
      displayLabel: formatLabel(label),
      name: this.currentName(),
      component: "text-input",
      renderHint: TEXT_RENDER_HINT,
      defaultValue: "",
      format,
      schema,
      inputProps,
      candidType: "text",
    }
  }

  /**
   * Generate format-specific input props for text fields.
   */
  private getTextInputProps(format: TextFormat): PrimitiveInputProps {
    switch (format) {
      case "email":
        return {
          type: "email",
          placeholder: "email@example.com",
          inputMode: "email",
          autoComplete: "email",
          spellCheck: false,
        }
      case "url":
        return {
          type: "url",
          placeholder: "https://example.com",
          inputMode: "url",
          autoComplete: "url",
          spellCheck: false,
        }
      case "phone":
        return {
          type: "tel",
          placeholder: "+1 (555) 123-4567",
          inputMode: "tel",
          autoComplete: "tel",
          spellCheck: false,
        }
      case "uuid":
        return {
          type: "text",
          placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
          pattern:
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
          spellCheck: false,
          autoComplete: "off",
        }
      case "btc":
        return {
          type: "text",
          placeholder: "bc1... or 1... or 3...",
          spellCheck: false,
          autoComplete: "off",
        }
      case "eth":
        return {
          type: "text",
          placeholder: "0x...",
          pattern: "0x[0-9a-fA-F]{40}",
          spellCheck: false,
          autoComplete: "off",
        }
      case "account-id":
        return {
          type: "text",
          placeholder: "64-character hex string",
          pattern: "[0-9a-fA-F]{64}",
          maxLength: 64,
          spellCheck: false,
          autoComplete: "off",
        }
      case "principal":
        return {
          type: "text",
          placeholder: "aaaaa-aa or full principal ID",
          minLength: 7,
          maxLength: 64,
          spellCheck: false,
          autoComplete: "off",
        }
      default:
        return {
          type: "text",
          placeholder: "Enter text...",
          spellCheck: true,
        }
    }
  }

  /**
   * Generate format-specific zod schema for text fields.
   */
  private getTextSchema(format: TextFormat): z.ZodTypeAny {
    switch (format) {
      case "email":
        return z.email("Invalid email address")
      case "url":
        return z.url("Invalid URL")
      case "uuid":
        return z.uuid("Invalid UUID")
      default:
        return z.string().min(1, "Required")
    }
  }

  public visitBool(_t: IDL.BoolClass, label: string): BooleanField {
    const inputProps: PrimitiveInputProps = {
      type: "checkbox",
    }

    return {
      type: "boolean",
      label,
      displayLabel: formatLabel(label),
      name: this.currentName(),
      component: "boolean-checkbox",
      renderHint: CHECKBOX_RENDER_HINT,
      defaultValue: false,
      schema: z.boolean(),
      inputProps,
      candidType: "bool",
    }
  }

  public visitNull(_t: IDL.NullClass, label: string): NullField {
    return {
      type: "null",
      label,
      displayLabel: formatLabel(label),
      name: this.currentName(),
      component: "null-hidden",
      renderHint: {
        isCompound: false,
        isPrimitive: true,
      },
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
  ): NumberField | TextField {
    const format = checkNumberFormat(label) as NumberFormat

    let schema = z.string().min(1, "Required")

    if (options.isFloat) {
      schema = schema.refine((val) => !isNaN(Number(val)), "Must be a number")
    } else if (options.unsigned) {
      schema = schema.regex(/^\d+$/, "Must be a positive number")
    } else {
      schema = schema.regex(/^-?\d+$/, "Must be a number")
    }

    // Use "text" type for large numbers (BigInt) to ensure precision and better UI handling
    // Standard number input has issues with large integers
    const isBigInt = !options.isFloat && (!options.bits || options.bits > 32)
    const type = isBigInt ? "text" : "number"

    if (type === "text") {
      // Propagate timestamp/cycle format if detected, otherwise default to plain
      let textFormat: TextFormat = "plain"
      if (format === "timestamp") textFormat = "timestamp"
      if (format === "cycle") textFormat = "cycle"

      const inputProps: PrimitiveInputProps = {
        type: "text",
        placeholder: options.unsigned ? "e.g. 100000" : "e.g. -100000",
        inputMode: "numeric",
        pattern: options.unsigned ? "\\d+" : "-?\\d+",
        spellCheck: false,
        autoComplete: "off",
      }

      return {
        type: "text",
        label,
        displayLabel: formatLabel(label),
        name: this.currentName(),
        component: "text-input",
        renderHint: TEXT_RENDER_HINT,
        defaultValue: "",
        format: textFormat,
        candidType,
        schema,
        inputProps,
      }
    }

    const inputProps: PrimitiveInputProps = {
      type: "number",
      placeholder: options.isFloat ? "0.0" : "0",
      inputMode: options.isFloat ? "decimal" : "numeric",
      min: options.min,
      max: options.max,
      step: options.isFloat ? "any" : "1",
    }

    return {
      type: "number",
      label,
      displayLabel: formatLabel(label),
      name: this.currentName(),
      component: "number-input",
      renderHint: NUMBER_RENDER_HINT,
      defaultValue: "",
      candidType,
      format,
      schema,
      inputProps,
      ...options,
    }
  }

  public visitInt(_t: IDL.IntClass, label: string): NumberField | TextField {
    return this.visitNumberType(label, "int", {
      unsigned: false,
      isFloat: false,
    })
  }

  public visitNat(_t: IDL.NatClass, label: string): NumberField | TextField {
    return this.visitNumberType(label, "nat", {
      unsigned: true,
      isFloat: false,
    })
  }

  public visitFloat(t: IDL.FloatClass, label: string): NumberField {
    return this.visitNumberType(label, `float${t._bits}`, {
      unsigned: false,
      isFloat: true,
      bits: t._bits,
    }) as NumberField
  }

  public visitFixedInt(
    t: IDL.FixedIntClass,
    label: string
  ): NumberField | TextField {
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
  ): NumberField | TextField {
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

  public visitType<T>(_t: IDL.Type<T>, label: string): UnknownField {
    return {
      type: "unknown",
      label,
      displayLabel: formatLabel(label),
      name: this.currentName(),
      component: "unknown-fallback",
      renderHint: {
        isCompound: false,
        isPrimitive: false,
      },
      defaultValue: undefined,
      candidType: "unknown",
      schema: z.any(),
    }
  }
}
