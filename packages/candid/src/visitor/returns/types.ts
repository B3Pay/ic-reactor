import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"

// ════════════════════════════════════════════════════════════════════════════
// Field Type Union
// ════════════════════════════════════════════════════════════════════════════

export type ResultFieldType =
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
// Display Type (what it becomes after transformation)
// ════════════════════════════════════════════════════════════════════════════

export type DisplayType =
  | "string" // Principal, nat, int, nat64, int64, blob, text
  | "number" // float32, float64, nat8-nat32, int8-int32
  | "boolean" // bool
  | "null" // null
  | "object" // record
  | "array" // vec, tuple
  | "variant" // variant (not Result)
  | "result" // variant { Ok, Err } - unwrapped to Ok value
  | "nullable" // opt T → T | null
  | "recursive" // rec types
  | "unknown" // fallback

// ════════════════════════════════════════════════════════════════════════════
// Format Hints
// ════════════════════════════════════════════════════════════════════════════

/**
 * Number-specific formatting hints derived from field names.
 */
export type NumberFormat = "timestamp" | "cycle" | "value" | "token" | "normal"

/**
 * Text-specific formatting hints derived from field names.
 */
export type TextFormat =
  | "plain"
  | "timestamp"
  | "uuid"
  | "url"
  | "email"
  | "phone"
  | "btc"
  | "eth"
  | "account-id"
  | "principal"

/**
 * Display hints for UI rendering.
 */
export type DisplayHint =
  | "copyable" // Show copy button
  | "linkable" // Can be linked
  | "truncate" // Truncate long values
  | "hex" // Display as hex
  | "code" // Display as code/monospace
  | "none" // No special formatting

// ════════════════════════════════════════════════════════════════════════════
// Base Field Interface
// ════════════════════════════════════════════════════════════════════════════

export interface ResultFieldBase {
  /** The Candid type category */
  type: ResultFieldType
  /** Human-readable label from Candid */
  label: string
  /** Original Candid type name */
  candidType: string
  /** What it becomes after display transformation */
  displayType: DisplayType
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Types
// ════════════════════════════════════════════════════════════════════════════

export interface RecordResultField extends ResultFieldBase {
  type: "record"
  displayType: "object"
  fields: ResultField[]
}

export interface VariantResultField extends ResultFieldBase {
  type: "variant"
  displayType: "variant" | "result"
  options: string[]
  optionFields: ResultField[]
  /** True if this is a Result type (Ok/Err pattern) */
  isResultType: boolean
}

export interface TupleResultField extends ResultFieldBase {
  type: "tuple"
  displayType: "array"
  fields: ResultField[]
}

export interface OptionalResultField extends ResultFieldBase {
  type: "optional"
  displayType: "nullable"
  innerField: ResultField
}

export interface VectorResultField extends ResultFieldBase {
  type: "vector"
  displayType: "array"
  itemField: ResultField
}

export interface BlobResultField extends ResultFieldBase {
  type: "blob"
  displayType: "string"
  displayHint: "hex"
}

export interface RecursiveResultField extends ResultFieldBase {
  type: "recursive"
  displayType: "recursive"
  typeName: string
  /** Lazily extract the inner field to prevent infinite loops */
  extract: () => ResultField
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Types
// ════════════════════════════════════════════════════════════════════════════

export interface PrincipalResultField extends ResultFieldBase {
  type: "principal"
  displayType: "string"
  textFormat: TextFormat
}

export interface NumberResultField extends ResultFieldBase {
  type: "number"
  displayType: "string" | "number"
  numberFormat: NumberFormat
}

export interface TextResultField extends ResultFieldBase {
  type: "text"
  displayType: "string"
  textFormat: TextFormat
}

export interface BooleanResultField extends ResultFieldBase {
  type: "boolean"
  displayType: "boolean"
}

export interface NullResultField extends ResultFieldBase {
  type: "null"
  displayType: "null"
}

export interface UnknownResultField extends ResultFieldBase {
  type: "unknown"
  displayType: "unknown"
}

// ════════════════════════════════════════════════════════════════════════════
// Union Type
// ════════════════════════════════════════════════════════════════════════════

export type ResultField =
  | RecordResultField
  | VariantResultField
  | TupleResultField
  | OptionalResultField
  | VectorResultField
  | BlobResultField
  | RecursiveResultField
  | PrincipalResultField
  | NumberResultField
  | TextResultField
  | BooleanResultField
  | NullResultField
  | UnknownResultField

// ════════════════════════════════════════════════════════════════════════════
// Method & Service Level
// ════════════════════════════════════════════════════════════════════════════

export interface MethodResultMeta<A = BaseActor> {
  functionType: FunctionType
  functionName: FunctionName<A>
  resultFields: ResultField[]
  returnCount: number
}

export type ServiceResultMeta<A = BaseActor> = {
  [K in FunctionName<A>]: MethodResultMeta<A>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

export type ResultFieldByType<T extends ResultFieldType> = Extract<
  ResultField,
  { type: T }
>

// ════════════════════════════════════════════════════════════════════════════
// Helper Types for Rendering
// ════════════════════════════════════════════════════════════════════════════

/**
 * A result field paired with its transformed value for rendering.
 * This is what you use at render time.
 */
export interface ResultFieldWithValue<T = unknown> {
  field: ResultField
  value: T
}

/**
 * Method result with both metadata and transformed values.
 */
export interface MethodResultWithValues<A = BaseActor> {
  meta: MethodResultMeta<A>
  values: unknown[]
}

// ════════════════════════════════════════════════════════════════════════════
// Legacy Type Aliases (for backward compatibility)
// ════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use MethodResultMeta instead
 */
export type MethodResultFields = {
  fields: ResultField[]
  returnCount: number
}

// Keep some types that might be referenced from old code
export type { ResultFieldType as FieldType } from "./types"
