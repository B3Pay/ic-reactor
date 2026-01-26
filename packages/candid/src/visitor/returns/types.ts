import type {
  BaseActor,
  FunctionName,
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
// Result Field With Value Interfaces
// ════════════════════════════════════════════════════════════════════════════

export interface RecordResultWithValue<V = unknown> {
  field: RecordResultField
  value: Record<string, ResultFieldWithValue>
  raw: V
}

export interface VariantResultWithValue<V = unknown> {
  field: VariantResultField
  value: ResultFieldWithValue
  raw: V
}

export interface TupleResultWithValue<V = unknown> {
  field: TupleResultField
  value: ResultFieldWithValue[]
  raw: V
}

export interface OptionalResultWithValue<V = unknown> {
  field: OptionalResultField
  value: ResultFieldWithValue | null
  raw: V
}

export interface VectorResultWithValue<V = unknown> {
  field: VectorResultField
  value: ResultFieldWithValue[]
  raw: V
}

export interface BlobResultWithValue<V = unknown> {
  field: BlobResultField
  value: string
  raw: V
}

export interface RecursiveResultWithValue<V = unknown> {
  field: RecursiveResultField
  // Resolves to the specific inner type which is also a ResultFieldWithValue
  value: ResultFieldWithValue
  raw: V
}

export interface PrincipalResultWithValue<V = unknown> {
  field: PrincipalResultField
  value: string
  raw: V
}

export interface NumberResultWithValue<V = unknown> {
  field: NumberResultField
  value: string | number
  raw: V
}

export interface TextResultWithValue<V = unknown> {
  field: TextResultField
  value: string
  raw: V
}

export interface BooleanResultWithValue<V = unknown> {
  field: BooleanResultField
  value: boolean
  raw: V
}

export interface NullResultWithValue<V = unknown> {
  field: NullResultField
  value: null
  raw: V
}

export interface UnknownResultWithValue<V = unknown> {
  field: UnknownResultField
  value: unknown
  raw: V
}

// ════════════════════════════════════════════════════════════════════════════
// Maps and Helper Types
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mapping from ResultFieldType string to the corresponding *ResultWithValue interface.
 */
export type ResultWithValueMap<V = unknown> = {
  record: RecordResultWithValue<V>
  variant: VariantResultWithValue<V>
  tuple: TupleResultWithValue<V>
  optional: OptionalResultWithValue<V>
  vector: VectorResultWithValue<V>
  blob: BlobResultWithValue<V>
  recursive: RecursiveResultWithValue<V>
  principal: PrincipalResultWithValue<V>
  number: NumberResultWithValue<V>
  text: TextResultWithValue<V>
  boolean: BooleanResultWithValue<V>
  null: NullResultWithValue<V>
  unknown: UnknownResultWithValue<V>
}

/**
 * A result field paired with its transformed value for rendering.
 * Can contain nested resolved fields for compound types.
 *
 * It is a discriminated union of all specific result types.
 */
export type ResultFieldWithValue<
  P = unknown,
  V = unknown,
> = P extends ResultFieldType
  ? ResultWithValueMap<V>[P]
  : ResultWithValueMap<V>[ResultFieldType]

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
