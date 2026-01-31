import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import * as z from "zod"
import type { VisitorDataType, TextFormat, NumberFormat } from "../types"

export type { TextFormat, NumberFormat }

// ════════════════════════════════════════════════════════════════════════════
// Field Type Union
// ════════════════════════════════════════════════════════════════════════════

export type ArgumentFieldType = VisitorDataType

// ════════════════════════════════════════════════════════════════════════════
// Component Type Hints
// ════════════════════════════════════════════════════════════════════════════

/**
 * Suggested component type for rendering the field.
 * This eliminates the need for switch statements in the frontend.
 *
 * @example
 * ```tsx
 * const componentMap = {
 *   'text-input': TextField,
 *   'number-input': NumberField,
 *   'boolean-checkbox': BooleanField,
 *   // ...
 * }
 * const Component = componentMap[field.component]
 * return <Component field={field} />
 * ```
 */
export type FieldComponentType =
  | "record-container"
  | "tuple-container"
  | "variant-select"
  | "optional-toggle"
  | "vector-list"
  | "blob-upload"
  | "principal-input"
  | "text-input"
  | "number-input"
  | "boolean-checkbox"
  | "null-hidden"
  | "recursive-lazy"
  | "unknown-fallback"

// ════════════════════════════════════════════════════════════════════════════
// Render Hints for UI Rendering Strategy
// ════════════════════════════════════════════════════════════════════════════

/**
 * Input type hints for HTML input elements.
 * Used by primitive fields to suggest the appropriate input type.
 */
export type InputType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "file"
  | "textarea"

// ════════════════════════════════════════════════════════════════════════════
// Format Detection Types (mirrors ResultFieldVisitor)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Rendering hints for the UI.
 * Eliminates the need for frontend to maintain COMPLEX_TYPES arrays.
 *
 * @example
 * ```tsx
 * // Frontend no longer needs:
 * // const COMPLEX_TYPES = ["record", "tuple", "variant", "vector", "optional"]
 *
 * // Instead use:
 * if (field.renderHint.isCompound) {
 *   return <CompoundFieldRenderer field={field} />
 * }
 * return <PrimitiveInput field={field} />
 * ```
 */
export interface RenderHint {
  /** Whether this field has its own container/card styling (compound types) */
  isCompound: boolean
  /** Whether this is a leaf input (primitive types) */
  isPrimitive: boolean
  /** Suggested input type for HTML input elements */
  inputType?: InputType
  /** Description or help text for the field (derived from Candid) */
  description?: string
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Input Props
// ════════════════════════════════════════════════════════════════════════════

/**
 * Pre-computed HTML input props for primitive fields.
 * Can be spread directly onto an input element.
 *
 * @example
 * ```tsx
 * <input {...field.inputProps} value={value} onChange={handleChange} />
 * ```
 */
export interface PrimitiveInputProps {
  /** HTML input type - includes format-specific types */
  type?: "text" | "number" | "checkbox" | "email" | "url" | "tel"
  /** Placeholder text */
  placeholder?: string
  /** Minimum value for number inputs */
  min?: string | number
  /** Maximum value for number inputs */
  max?: string | number
  /** Step value for number inputs */
  step?: string | number
  /** Pattern for text inputs (e.g., phone numbers) */
  pattern?: string
  /** Input mode for virtual keyboards */
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "url"
  /** Autocomplete hint */
  autoComplete?: string
  /** Whether to check spelling */
  spellCheck?: boolean
  /** Minimum length for text inputs */
  minLength?: number
  /** Maximum length for text inputs */
  maxLength?: number
}

// ════════════════════════════════════════════════════════════════════════════
// Base Field Interface
// ════════════════════════════════════════════════════════════════════════════

export interface FieldBase<TValue = unknown> {
  /** The field type */
  type: ArgumentFieldType
  /** Raw label from Candid: "__arg0", "_0_" */
  label: string
  /**
   * Pre-formatted display label for UI rendering.
   * Transforms raw labels into human-readable format.
   *
   * @example
   * "__arg0" => "Arg 0"
   * "_0_" => "Item 0"
   * "created_at_time" => "Created At Time"
   */
  displayLabel: string
  /**
   * Form field name path for binding.
   * Uses bracket notation for array indices: `[0]`, `args[0].owner`, `tags[1]`
   * Compatible with TanStack Form's `form.Field` name prop.
   *
   * @example
   * ```tsx
   * <form.Field name={field.name}>
   *   {(fieldApi) => <input {...} />}
   * </form.Field>
   * ```
   */
  name: string
  /**
   * Suggested component type for rendering this field.
   * Eliminates the need for switch statements in the frontend.
   */
  component: FieldComponentType
  /**
   * Rendering hints for UI strategy.
   * Use this to determine if the field needs a container or is a simple input.
   */
  renderHint: RenderHint
  /** Zod schema for field validation */
  schema: z.ZodTypeAny
  /** Default value for the field */
  defaultValue: TValue
  /** Original Candid type name for reference */
  candidType?: string
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Types
// ════════════════════════════════════════════════════════════════════════════

export interface RecordField extends FieldBase<Record<string, unknown>> {
  type: "record"
  /** Child fields in the record */
  fields: Field[]
  /** Map of field label to its metadata for quick lookup */
  fieldMap: Map<string, Field>
}

export interface VariantField extends FieldBase<Record<string, unknown>> {
  type: "variant"
  /** All variant option fields */
  fields: Field[]
  /** List of variant option names */
  options: string[]
  /** Default selected option */
  defaultOption: string
  /** Map of option name to its field metadata */
  optionMap: Map<string, Field>
  /**
   * Get default value for a specific option.
   * Useful when switching between variant options.
   *
   * @example
   * ```tsx
   * const handleOptionChange = (newOption: string) => {
   *   const newDefault = field.getOptionDefault(newOption)
   *   fieldApi.handleChange(newDefault)
   * }
   * ```
   */
  getOptionDefault: (option: string) => Record<string, unknown>
  /**
   * Get the field for a specific option.
   *
   * @example
   * ```tsx
   * const transferField = field.getField("Transfer")
   * ```
   */
  getField: (option: string) => Field
  /**
   * Get the currently selected option from a value.
   * Returns the first valid key found, or the default option.
   *
   * @example
   * ```tsx
   * const selectedOption = field.getSelectedOption(currentValue)
   * // { Transfer: {...} } => "Transfer"
   * ```
   */
  getSelectedOption: (value: Record<string, unknown>) => string
  /**
   * Get the selected field from a value.
   * Combines getSelectedOption and getField for convenience.
   *
   * @example
   * ```tsx
   * // Current (verbose):
   * const validKeys = Object.keys(currentValue).filter(k => field.options.includes(k))
   * const selected = validKeys[0] ?? field.options[0]
   * const selectedIndex = Math.max(0, field.options.indexOf(selected))
   * const selectedField = field.fields[selectedIndex]
   *
   * // Proposed (simple):
   * const selectedField = field.getSelectedField(currentValue)
   * ```
   */
  getSelectedField: (value: Record<string, unknown>) => Field
}

export interface TupleField extends FieldBase<unknown[]> {
  type: "tuple"
  /** Tuple element fields in order */
  fields: Field[]
}

export interface OptionalField extends FieldBase<null> {
  type: "optional"
  /** The inner field when value is present */
  innerField: Field
  /**
   * Get default value when enabling the optional.
   * Returns the inner field's default value.
   *
   * @example
   * ```tsx
   * const handleToggle = (enabled: boolean) => {
   *   if (enabled) {
   *     fieldApi.handleChange(field.getInnerDefault())
   *   } else {
   *     fieldApi.handleChange(null)
   *   }
   * }
   * ```
   */
  getInnerDefault: () => unknown
  /**
   * Check if a value represents an enabled optional.
   * Returns true if the value is not null or undefined.
   *
   * @example
   * ```tsx
   * // Current:
   * const enabled = fieldApi.state.value !== null && typeof fieldApi.state.value !== "undefined"
   *
   * // Proposed:
   * const enabled = field.isEnabled(fieldApi.state.value)
   * ```
   */
  isEnabled: (value: unknown) => boolean
}

export interface VectorField extends FieldBase<unknown[]> {
  type: "vector"
  /** Template field for vector items */
  itemField: Field
  /**
   * Get a new item with default values.
   * Used when adding items to the vector.
   *
   * @example
   * ```tsx
   * <button onClick={() => fieldApi.pushValue(field.getItemDefault())}>
   *   Add Item
   * </button>
   * ```
   */
  getItemDefault: () => unknown
  /**
   * Create a properly configured item field for a specific index.
   * Handles name path and label generation.
   *
   * @example
   * ```tsx
   * // Current:
   * renderField({
   *   ...field.itemField,
   *   label: itemLabel,
   *   name: itemFieldName
   * })
   *
   * // Proposed:
   * const itemField = field.createItemField(index, { label: itemLabel })
   * renderField(itemField)
   * ```
   */
  createItemField: (index: number, overrides?: { label?: string }) => Field
}

/**
 * Blob field size limits.
 */
export interface BlobLimits {
  /** Maximum bytes when entering as hex (e.g., 512 bytes) */
  maxHexBytes: number
  /** Maximum file size in bytes (e.g., 2MB ICP limit) */
  maxFileBytes: number
  /** Maximum hex display length before truncation */
  maxHexDisplayLength: number
}

/**
 * Validation result for blob input.
 */
export interface BlobValidationResult {
  /** Whether the input is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
}

export interface BlobField extends FieldBase<string> {
  type: "blob"
  /** Item field for individual bytes (nat8) */
  itemField: Field
  /** Accepted input formats */
  acceptedFormats: ("hex" | "base64" | "file")[]
  /** Size limits for blob input */
  limits: BlobLimits
  /**
   * Normalize hex input (remove 0x prefix, lowercase, etc.)
   *
   * @example
   * ```tsx
   * const normalized = field.normalizeHex("0xDEADBEEF")
   * // => "deadbeef"
   * ```
   */
  normalizeHex: (input: string) => string
  /**
   * Validate blob input value.
   *
   * @example
   * ```tsx
   * const result = field.validateInput(value)
   * if (!result.valid) {
   *   setError(result.error)
   * }
   * ```
   */
  validateInput: (value: string | Uint8Array) => BlobValidationResult
}

export interface RecursiveField extends FieldBase<undefined> {
  type: "recursive"
  /** Type name for the recursive type */
  typeName: string
  /** Lazily extract the inner field to prevent infinite loops */
  extract: () => Field
  /**
   * Get default value for the recursive type.
   * Evaluates the inner type on demand.
   */
  getInnerDefault: () => unknown
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Types
// ════════════════════════════════════════════════════════════════════════════

export interface PrincipalField extends FieldBase<string> {
  type: "principal"
  maxLength: number
  minLength: number
  /**
   * Detected format based on label heuristics.
   * Useful for specialized rendering (e.g., canister links).
   */
  format: TextFormat
  /**
   * Pre-computed HTML input props for direct spreading.
   * @example
   * ```tsx
   * <input {...field.inputProps} value={value} onChange={handleChange} />
   * ```
   */
  inputProps: PrimitiveInputProps
}

export interface NumberField extends FieldBase<string> {
  type: "number"
  /**
   * Original Candid type: nat, int, nat8, nat16, nat32, nat64, int8, int16, int32, int64, float32, float64
   */
  candidType: string
  /** Whether this is an unsigned type */
  unsigned: boolean
  /** Whether this is a floating point type */
  isFloat: boolean
  /** Bit width if applicable (8, 16, 32, 64, or undefined for unbounded) */
  bits?: number
  /** Minimum value constraint (for bounded types) */
  min?: string
  /** Maximum value constraint (for bounded types) */
  max?: string
  /**
   * Detected format based on label heuristics.
   * Useful for specialized display (e.g., timestamp formatting).
   */
  format: NumberFormat
  /**
   * Pre-computed HTML input props for direct spreading.
   * @example
   * ```tsx
   * <input {...field.inputProps} value={value} onChange={handleChange} />
   * ```
   */
  inputProps: PrimitiveInputProps
}

export interface TextField extends FieldBase<string> {
  type: "text"
  /** Minimum length constraint */
  minLength?: number
  /** Maximum length constraint */
  maxLength?: number
  /** Whether to render as multiline textarea */
  multiline?: boolean
  /**
   * Detected format based on label heuristics.
   * Provides format-specific validation and input props.
   *
   * @example
   * - "email" → type="email", inputMode="email"
   * - "url" → type="url", inputMode="url"
   * - "phone" → type="tel", inputMode="tel"
   */
  format: TextFormat
  /**
   * Pre-computed HTML input props for direct spreading.
   * Includes format-specific attributes (type="email", pattern, etc.).
   *
   * @example
   * ```tsx
   * <input {...field.inputProps} value={value} onChange={handleChange} />
   * ```
   */
  inputProps: PrimitiveInputProps
}

export interface BooleanField extends FieldBase<boolean> {
  type: "boolean"
  /**
   * Pre-computed HTML input props for direct spreading.
   * @example
   * ```tsx
   * <input {...field.inputProps} checked={value} onChange={handleChange} />
   * ```
   */
  inputProps: PrimitiveInputProps
}

export interface NullField extends FieldBase<null> {
  type: "null"
}

export interface UnknownField extends FieldBase<undefined> {
  type: "unknown"
}

// ════════════════════════════════════════════════════════════════════════════
// Union Type
// ════════════════════════════════════════════════════════════════════════════

export type Field =
  | RecordField
  | VariantField
  | TupleField
  | OptionalField
  | VectorField
  | BlobField
  | RecursiveField
  | PrincipalField
  | NumberField
  | TextField
  | BooleanField
  | NullField
  | UnknownField

// ════════════════════════════════════════════════════════════════════════════
// Form Metadata - TanStack Form Integration
// ════════════════════════════════════════════════════════════════════════════

/**
 * Form metadata for a Candid method.
 * Contains all information needed to create a TanStack Form instance.
 *
 * @example
 * ```tsx
 * import { useForm } from '@tanstack/react-form'
 *
 * function MethodForm({ meta }: { meta: FormMeta }) {
 *   const form = useForm({
 *     ...meta.formOptions,
 *     onSubmit: async ({ value }) => {
 *       await actor[meta.functionName](...value)
 *     }
 *   })
 *
 *   return (
 *     <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
 *       {meta.fields.map(field => (
 *         <form.Field key={field.name} name={field.name}>
 *           {(fieldApi) => <DynamicInput field={field} fieldApi={fieldApi} />}
 *         </form.Field>
 *       ))}
 *       <button type="submit">Submit</button>
 *     </form>
 *   )
 * }
 * ```
 */
export interface ArgumentsMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  /** Whether this is a "query" or "update" function */
  functionType: FunctionType
  /** The function name */
  functionName: Name
  /** Argument field definitions for rendering */
  fields: Field[]
  /** Default values for all arguments (as a tuple) */
  defaultValues: unknown[]
  /** Combined Zod schema for all arguments */
  schema: z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]]>
  /** Number of arguments */
  argCount: number
  /** Whether the function takes no arguments */
  isNoArgs: boolean
}

/**
 * Options that can be spread into useForm().
 * Pre-configured with defaultValues and validators.
 */
export interface FormOptions {
  /** Initial form values */
  defaultValues: unknown[]
  /** Validators using the Zod schema */
  validators: {
    onChange: z.ZodTypeAny
    onBlur: z.ZodTypeAny
  }
}

/**
 * Service-level form metadata.
 * Maps each method name to its FormMeta.
 */
export type ArgumentsServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]: ArgumentsMeta<A, K>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities & Guards
// ════════════════════════════════════════════════════════════════════════════

/** Extract a specific field type */
export type FieldByType<T extends ArgumentFieldType> = Extract<
  Field,
  { type: T }
>

/**
 * Props type helper for field components.
 * Use this to type your field components for better DX.
 *
 * @example
 * ```tsx
 * const VariantField: React.FC<FieldProps<'variant'>> = ({ field, renderField }) => {
 *   // field is properly typed as VariantField
 *   return (
 *     <div>
 *       <select>{field.options.map(opt => ...)}</select>
 *       {renderField?.(field.getSelectedField(currentValue))}
 *     </div>
 *   )
 * }
 * ```
 */
export type FieldProps<T extends ArgumentFieldType> = {
  field: FieldByType<T>
  renderField?: (child: Field) => React.ReactNode
}

/** Compound field types that contain other fields */
export type CompoundField =
  | RecordField
  | VariantField
  | TupleField
  | OptionalField
  | VectorField
  | RecursiveField

/** Primitive field types */
export type PrimitiveField =
  | PrincipalField
  | NumberField
  | TextField
  | BooleanField
  | NullField

/**
 * A complete mapping of component types to React components.
 * Use this type when defining your component map.
 *
 * @example
 * ```tsx
 * const componentMap: ComponentMap<typeof MyTextInput, typeof MyNumberInput, ...> = {
 *   'text-input': MyTextInput,
 *   'number-input': MyNumberInput,
 *   // ...
 * }
 * ```
 */
export type ComponentMap<
  TComponents extends Record<FieldComponentType, unknown>,
> = {
  [K in FieldComponentType]: TComponents[K]
}

/**
 * Get the component type for a given field component type.
 * Useful for typing dynamic component lookups.
 */
export type GetComponentType<
  TMap extends Partial<Record<FieldComponentType, unknown>>,
  TKey extends FieldComponentType,
> = TKey extends keyof TMap ? TMap[TKey] : never
