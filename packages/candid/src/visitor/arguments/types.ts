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

export interface ArgumentFieldBase<TValue = unknown> {
  /** The field type */
  type: ArgumentFieldType
  /** Human-readable label from Candid */
  label: string
  /**
   * Form field name path for binding.
   * Uses bracket notation for array indices: `[0]`, `args[0].owner`, `tags[1]`
   * Compatible with TanStack Form name patterns.
   */
  name: string
  /** Zod schema for validation */
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

export interface RecordArgumentField extends ArgumentFieldBase<
  Record<string, unknown>
> {
  type: "record"
  /** Child fields in the record */
  fields: ArgumentField[]
  /** Map of field label to its metadata for quick lookup */
  fieldMap: Map<string, ArgumentField>
}

export interface VariantArgumentField extends ArgumentFieldBase<
  Record<string, unknown>
> {
  type: "variant"
  /** All variant option fields */
  fields: ArgumentField[]
  /** List of variant option names */
  options: string[]
  /** Default selected option */
  defaultOption: string
  /** Map of option name to its field metadata */
  optionMap: Map<string, ArgumentField>
  /**
   * Get default value for a specific option.
   * Useful when switching between variant options.
   */
  getOptionDefault: (option: string) => Record<string, unknown>
}

export interface TupleArgumentField extends ArgumentFieldBase<unknown[]> {
  type: "tuple"
  /** Tuple element fields in order */
  fields: ArgumentField[]
}

export interface OptionalArgumentField extends ArgumentFieldBase<null> {
  type: "optional"
  /** The inner field when value is present */
  innerField: ArgumentField
  /**
   * Get default value when enabling the optional.
   * Returns the inner field's default value.
   */
  getInnerDefault: () => unknown
}

export interface VectorArgumentField extends ArgumentFieldBase<unknown[]> {
  type: "vector"
  /** Template field for vector items */
  itemField: ArgumentField
  /**
   * Get a new item with default values.
   * Used when adding items to the vector.
   */
  getItemDefault: () => unknown
}

export interface BlobArgumentField extends ArgumentFieldBase<string> {
  type: "blob"
  /** Item field for individual bytes (nat8) */
  itemField: ArgumentField
  /** Accepted input formats */
  acceptedFormats: ("hex" | "base64" | "file")[]
}

export interface RecursiveArgumentField extends ArgumentFieldBase<undefined> {
  type: "recursive"
  /** Type name for the recursive type */
  typeName: string
  /** Lazily extract the inner field to prevent infinite loops */
  extract: () => ArgumentField
  /**
   * Get default value for the recursive type.
   * Evaluates the inner type on demand.
   */
  getInnerDefault: () => unknown
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Types
// ════════════════════════════════════════════════════════════════════════════

export interface PrincipalArgumentField extends ArgumentFieldBase<string> {
  type: "principal"
  maxLength: number
  minLength: number
}

export interface NumberArgumentField extends ArgumentFieldBase<string> {
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

export interface TextArgumentField extends ArgumentFieldBase<string> {
  type: "text"
  /** Minimum length constraint */
  minLength?: number
  /** Maximum length constraint */
  maxLength?: number
  /** Whether to render as multiline textarea */
  multiline?: boolean
}

export interface BooleanArgumentField extends ArgumentFieldBase<boolean> {
  type: "boolean"
}

export interface NullArgumentField extends ArgumentFieldBase<null> {
  type: "null"
}

export interface UnknownArgumentField extends ArgumentFieldBase<undefined> {
  type: "unknown"
}

// ════════════════════════════════════════════════════════════════════════════
// Union Type
// ════════════════════════════════════════════════════════════════════════════

export type ArgumentField =
  | RecordArgumentField
  | VariantArgumentField
  | TupleArgumentField
  | OptionalArgumentField
  | VectorArgumentField
  | BlobArgumentField
  | RecursiveArgumentField
  | PrincipalArgumentField
  | NumberArgumentField
  | TextArgumentField
  | BooleanArgumentField
  | NullArgumentField
  | UnknownArgumentField

// ════════════════════════════════════════════════════════════════════════════
// Method & Service Level
// ════════════════════════════════════════════════════════════════════════════

export interface MethodArgumentsMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  /** Whether this is a "query" or "update" function */
  functionType: FunctionType
  /** The function name */
  functionName: Name
  /** Argument field definitions */
  fields: ArgumentField[]
  /** Default values for all arguments (as a tuple) */
  defaultValue: unknown[]
  /** Combined Zod schema for all arguments */
  schema: z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]]>
  /** Number of arguments */
  argCount: number
  /** Whether the function takes no arguments */
  isNoArgs: boolean
}

export type ServiceArgumentsMeta<A = BaseActor> = {
  [K in FunctionName<A>]: MethodArgumentsMeta<A, K>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

/** Extract a specific field type */
export type ArgumentFieldByType<T extends ArgumentFieldType> = Extract<
  ArgumentField,
  { type: T }
>

/** Check if field is a compound type */
export type CompoundArgumentField =
  | RecordArgumentField
  | VariantArgumentField
  | TupleArgumentField
  | OptionalArgumentField
  | VectorArgumentField
  | RecursiveArgumentField

/** Check if field is a primitive type */
export type PrimitiveArgumentField =
  | PrincipalArgumentField
  | NumberArgumentField
  | TextArgumentField
  | BooleanArgumentField
  | NullArgumentField

/** Type guard for field types */
export function isFieldType<T extends ArgumentFieldType>(
  field: ArgumentField,
  type: T
): field is ArgumentFieldByType<T> {
  return field.type === type
}

/** Check if a field is a compound type */
export function isCompoundField(
  field: ArgumentField
): field is CompoundArgumentField {
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
export function isPrimitiveField(
  field: ArgumentField
): field is PrimitiveArgumentField {
  return ["principal", "number", "text", "boolean", "null"].includes(field.type)
}
