import type {
  BaseActor,
  FunctionName,
  DisplayOf,
  FunctionType,
  ActorMethodReturnType,
} from "@ic-reactor/core"

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

export interface ResultFieldBase<
  Type extends ResultFieldType = ResultFieldType,
> {
  /** The Candid type category */
  type: Type
  /** Human-readable label from Candid */
  label: string
  /** Original Candid type name */
  candidType: string
  /** What it becomes after display transformation */
  displayType: DisplayType
  /**
   * Combine metadata with value to create a render-ready tree.
   * This allows "zipping" the static schema with dynamic runtime data.
   */
  resolve(value: unknown): ResultFieldWithValue<Type>
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Types
// ════════════════════════════════════════════════════════════════════════════

export interface RecordResultField extends ResultFieldBase<"record"> {
  type: "record"
  displayType: "object"
  fields: ResultField[]
}

export interface VariantResultField extends ResultFieldBase<"variant"> {
  type: "variant"
  displayType: "variant" | "result"
  options: string[]
  optionFields: ResultField[]
}

export interface TupleResultField extends ResultFieldBase<"tuple"> {
  type: "tuple"
  displayType: "array"
  fields: ResultField[]
}

export interface OptionalResultField extends ResultFieldBase<"optional"> {
  type: "optional"
  displayType: "nullable"
  innerField: ResultField
}

export interface VectorResultField extends ResultFieldBase<"vector"> {
  type: "vector"
  displayType: "array"
  itemField: ResultField
}

export interface BlobResultField extends ResultFieldBase<"blob"> {
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

export interface PrincipalResultField extends ResultFieldBase<"principal"> {
  type: "principal"
  displayType: "string"
  textFormat: TextFormat
}

export interface NumberResultField extends ResultFieldBase<"number"> {
  type: "number"
  displayType: "string" | "number"
  numberFormat: NumberFormat
}

export interface TextResultField extends ResultFieldBase<"text"> {
  type: "text"
  displayType: "string"
  textFormat: TextFormat
}

export interface BooleanResultField extends ResultFieldBase<"boolean"> {
  type: "boolean"
  displayType: "boolean"
}

export interface NullResultField extends ResultFieldBase<"null"> {
  type: "null"
  displayType: "null"
}

export interface UnknownResultField extends ResultFieldBase<"unknown"> {
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
// Helper Types for Rendering
// ════════════════════════════════════════════════════════════════════════════

/**
 * A result field paired with its transformed value for rendering.
 * Can contain nested resolved fields for compound types.
 */
export type ResultFieldWithValue<P = unknown, V = unknown> = [P] extends [
  ResultFieldType,
]
  ? {
      field: ResultFieldByType<P>
      value: DisplayOf<V>
      raw: V
    }
  : {
      field: ResultField
      value: DisplayOf<P>
      raw: P
    }

// ════════════════════════════════════════════════════════════════════════════
// Method & Service Level
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolved method result containing metadata and resolved field values.
 * This is the output of `generateMetadata()`.
 */
export interface ResolvedMethodResult<A = BaseActor> {
  functionType: FunctionType
  functionName: FunctionName<A>
  results: ResultFieldWithValue[]
  raw: ActorMethodReturnType<A[FunctionName<A>]>
}

export interface MethodResultMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  functionType: FunctionType
  functionName: Name
  resultFields: ResultField[]
  returnCount: number
  /**
   * Generate metadata by resolving each result field with its corresponding display value.
   * This "zips" the static schema with dynamic runtime data for easy rendering.
   *
   * @param data - Array of display-transformed return values from the canister method call
   * @returns Resolved method result with metadata attached to each value
   *
   * @example
   * ```ts
   * const result = await reactor.callMethod({ functionName: "myMethod", args: [] })
   * const resolved = methodMeta.generateMetadata(result)
   * // resolved.results contains fields with their display values for rendering
   * ```
   */
  generateMetadata(
    data: ActorMethodReturnType<A[Name]>
  ): ResolvedMethodResult<A>
}

export type ServiceResultMeta<A = BaseActor> = {
  [K in FunctionName<A>]: MethodResultMeta<A, K>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

export type ResultFieldByType<T extends ResultFieldType> = Extract<
  ResultField,
  { type: T }
>
