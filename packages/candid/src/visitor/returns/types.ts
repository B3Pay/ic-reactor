import type { IDL, FieldType, AllNumberTypes, Principal } from "../types"

/**
 * Display hints for UI/UX enhancements in result rendering.
 * These guide how a value should be displayed beyond just its type.
 */
export type DisplayHint =
  | "copyable" // Show copy button
  | "linkable" // Can be linked (e.g., to dashboard)
  | "timestamp" // Format as date/time
  | "currency" // Format with decimal places
  | "hex" // Show as hex string
  | "truncate" // Truncate long values
  | "code" // Display as code/monospace
  | "none" // No special formatting

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
 * Base interface for all result field types.
 * Keep it minimal - only what's needed for rendering.
 */
export interface ResultFieldBase {
  /** Candid type category */
  type: FieldType
  /** Human-readable label from Candid */
  label: string
  /** The specific value of this field (always present; use null when missing) */
  value: any
  /** Display hint for UI enhancement */
  displayHint?: DisplayHint
  /** How to format the text based on field name analysis */
  textFormat?: TextFormat
}

/**
 * Principal result field - always copyable and linkable
 */
export interface PrincipalResultField extends ResultFieldBase {
  type: "principal"
  /**
   * Check if a principal value is a canister ID.
   * All canister IDs on the Internet Computer end with "-cai" suffix.
   */
  checkIsCanisterId: (value: string | Principal) => boolean
  displayHint: DisplayHint
}

/**
 * Number result field with format hints
 */
export interface NumberResultField extends ResultFieldBase {
  type: "number"
  /** How to format the number based on field name analysis */
  numberFormat: NumberFormat
  /** Original Candid type name (nat, int, nat64, etc.) */
  candidType: string
}

/**
 * Text result field
 */
export interface TextResultField extends ResultFieldBase {
  type: "text"
}

/**
 * Boolean result field
 */
export interface BooleanResultField extends ResultFieldBase {
  type: "boolean"
}

/**
 * Null result field
 */
export interface NullResultField extends ResultFieldBase {
  type: "null"
}

/**
 * Blob result field (small blobs represented as hex or bytes)
 */
export interface BlobResultField extends ResultFieldBase {
  type: "blob"
  displayHint: "hex"
  /** Raw hex string or byte array for small blobs; `null` when missing */
  value: string | Uint8Array | number[] | null
}

/**
 * Large blob summary (avoid rendering entire payload)
 */
export interface LargeBlobResultField extends ResultFieldBase {
  type: "blob-large"
  displayHint: "hex"
  /** Summary object provided by the visitor; `value` can be null when not present */
  value: {
    hash: string
    /** Hex string or bytes if available; null when absent */
    value: string | Uint8Array | number[] | null
    length: number
  }
}

/**
 * Optional result field - wraps another field type
 */
export interface OptionalResultField extends ResultFieldBase {
  type: "optional"
  /** The inner field type when value is present */
  innerField: ResultField
}

/**
 * Vector result field - array of items
 */
export interface VectorResultField extends ResultFieldBase {
  type: "vector"
  /** Type definition for each item in the array */
  itemField: ResultField
  /** Optional per-item field instances with values filled in when available */
  items?: ResultField[]
}

/**
 * Table result field - vector of records suitable for table display
 */
export interface TableResultField extends ResultFieldBase {
  type: "table"
  /** Column names for table header */
  columns: string[]
  /** Field definitions for each column */
  columnFields: ResultField[]
}

/**
 * Record result field - object with named fields
 */
export interface RecordResultField extends ResultFieldBase {
  type: "record"
  /** Named fields in the record */
  fields: ResultField[]
}

/**
 * Tuple result field - fixed-length array
 */
export interface TupleResultField extends ResultFieldBase {
  type: "tuple"
  /** Fields for each tuple position */
  fields: ResultField[]
}

/**
 * Variant result field - tagged union type
 */
export interface VariantResultField extends ResultFieldBase {
  type: "variant"
  /** Possible option names */
  options: string[]
  /** Field definition for each option's value */
  optionFields: ResultField[]
}

/**
 * Recursive result field - self-referential type
 */
export interface RecursiveResultField extends ResultFieldBase {
  type: "recursive"
  /** Type name for display */
  typeName: string
  /** Lazily extract the inner field definition. Pass a value to generate with that value. */
  extract: (value?: unknown) => ResultField
}

/**
 * Unknown/fallback result field
 */
export interface UnknownResultField extends ResultFieldBase {
  type: "unknown"
}

/**
 * Union of all result field types
 */
export type ResultField =
  | PrincipalResultField
  | NumberResultField
  | TextResultField
  | BooleanResultField
  | NullResultField
  | BlobResultField
  | LargeBlobResultField
  | OptionalResultField
  | VectorResultField
  | TableResultField
  | RecordResultField
  | TupleResultField
  | VariantResultField
  | RecursiveResultField
  | UnknownResultField

/**
 * Method-level result metadata
 */
export interface MethodResultFields {
  /** Array of return type field definitions */
  fields: ResultField[]
  /** Number of return values */
  returnCount: number
}

/**
 * Type utilities
 */
export type ResultFieldByType<T extends FieldType> = Extract<
  ResultField,
  { type: T }
>

export type DynamicResultFieldByClass<T extends IDL.Type> =
  T extends IDL.RecordClass
    ? RecordResultField
    : T extends IDL.TupleClass<IDL.Type[]>
      ? TupleResultField
      : T extends IDL.VariantClass
        ? VariantResultField
        : T extends IDL.VecClass<IDL.Type>
          ? VectorResultField
          : T extends IDL.OptClass<IDL.Type>
            ? OptionalResultField
            : T extends IDL.RecClass<IDL.Type>
              ? RecursiveResultField
              : T extends IDL.PrincipalClass
                ? PrincipalResultField
                : T extends AllNumberTypes
                  ? NumberResultField
                  : ResultField
