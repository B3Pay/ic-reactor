import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import * as z from "zod"

// ════════════════════════════════════════════════════════════════════════════
// Field Type Union
// ════════════════════════════════════════════════════════════════════════════

export type ArgumentFieldType =
  | "record"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "blob"
  | "recursive"
  | "principal"
  | "number"
  | "text"
  | "boolean"
  | "null"
  | "unknown"

// ════════════════════════════════════════════════════════════════════════════
// UI Hints for Form Rendering
// ════════════════════════════════════════════════════════════════════════════

export interface FieldUIHints {
  /** Placeholder text for the input */
  placeholder?: string
  /** Description or help text for the field */
  description?: string
  /** Whether the field is required */
  required?: boolean
  /** Whether the field should be disabled */
  disabled?: boolean
  /** Additional CSS class names */
  className?: string
}

// ════════════════════════════════════════════════════════════════════════════
// Base Field Interface
// ════════════════════════════════════════════════════════════════════════════

export interface FieldBase<TValue = unknown> {
  /** The field type */
  type: ArgumentFieldType
  /** Human-readable label from Candid */
  label: string
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
  /** Zod schema for field validation */
  schema: z.ZodTypeAny
  /** Default value for the field */
  defaultValue: TValue
  /** Original Candid type name for reference */
  candidType?: string
  /** UI rendering hints */
  ui?: FieldUIHints
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
}

export interface BlobField extends FieldBase<string> {
  type: "blob"
  /** Item field for individual bytes (nat8) */
  itemField: Field
  /** Accepted input formats */
  acceptedFormats: ("hex" | "base64" | "file")[]
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
}

export interface TextField extends FieldBase<string> {
  type: "text"
  /** Minimum length constraint */
  minLength?: number
  /** Maximum length constraint */
  maxLength?: number
  /** Whether to render as multiline textarea */
  multiline?: boolean
}

export interface BooleanField extends FieldBase<boolean> {
  type: "boolean"
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
 * Type guard for checking specific field types.
 *
 * @example
 * ```tsx
 * function FieldInput({ field }: { field: Field }) {
 *   if (isFieldType(field, 'record')) {
 *     // field is now typed as RecordField
 *     return <RecordInput field={field} />
 *   }
 *   if (isFieldType(field, 'text')) {
 *     // field is now typed as TextField
 *     return <TextInput field={field} />
 *   }
 *   // ...
 * }
 * ```
 */
export function isFieldType<T extends ArgumentFieldType>(
  field: Field,
  type: T
): field is FieldByType<T> {
  return field.type === type
}

/** Check if a field is a compound type (contains other fields) */
export function isCompoundField(field: Field): field is CompoundField {
  return [
    "record",
    "variant",
    "tuple",
    "optional",
    "vector",
    "recursive",
  ].includes(field.type)
}

/** Check if a field is a primitive type */
export function isPrimitiveField(field: Field): field is PrimitiveField {
  return ["principal", "number", "text", "boolean", "null"].includes(field.type)
}

/** Check if a field has children (for iteration) */
export function hasChildFields(
  field: Field
): field is RecordField | VariantField | TupleField {
  return "fields" in field && Array.isArray((field as RecordField).fields)
}
