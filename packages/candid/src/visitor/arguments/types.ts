import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"

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
// Base Field Interface
// ════════════════════════════════════════════════════════════════════════════

export interface ArgumentFieldBase {
  /** The field type */
  type: ArgumentFieldType
  /** Human-readable label from Candid */
  label: string
  /** Dot-notation path for form binding (e.g., "0.owner", "[0].to") */
  path: string
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Types
// ════════════════════════════════════════════════════════════════════════════

export interface RecordArgumentField extends ArgumentFieldBase {
  type: "record"
  fields: ArgumentField[]
  defaultValues: Record<string, unknown>
}

export interface VariantArgumentField extends ArgumentFieldBase {
  type: "variant"
  fields: ArgumentField[]
  options: string[]
  defaultOption: string
  defaultValues: Record<string, unknown>
}

export interface TupleArgumentField extends ArgumentFieldBase {
  type: "tuple"
  fields: ArgumentField[]
  defaultValues: unknown[]
}

export interface OptionalArgumentField extends ArgumentFieldBase {
  type: "optional"
  innerField: ArgumentField
  defaultValue: null
}

export interface VectorArgumentField extends ArgumentFieldBase {
  type: "vector"
  itemField: ArgumentField
  defaultValue: []
}

export interface BlobArgumentField extends ArgumentFieldBase {
  type: "blob"
  itemField: ArgumentField
  /** Default is empty hex string */
  defaultValue: string
}

export interface RecursiveArgumentField extends ArgumentFieldBase {
  type: "recursive"
  /** Lazily extract the inner field to prevent infinite loops */
  extract: () => ArgumentField
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Types
// ════════════════════════════════════════════════════════════════════════════

export interface PrincipalArgumentField extends ArgumentFieldBase {
  type: "principal"
  /** Display format: string */
  defaultValue: string
  maxLength: number
  minLength: number
}

export interface NumberArgumentField extends ArgumentFieldBase {
  type: "number"
  /** Display format: string (for bigint compatibility) */
  defaultValue: string
  /** Original Candid type: nat, int, nat64, etc. */
  candidType: string
}

export interface TextArgumentField extends ArgumentFieldBase {
  type: "text"
  defaultValue: string
}

export interface BooleanArgumentField extends ArgumentFieldBase {
  type: "boolean"
  defaultValue: boolean
}

export interface NullArgumentField extends ArgumentFieldBase {
  type: "null"
  defaultValue: null
}

export interface UnknownArgumentField extends ArgumentFieldBase {
  type: "unknown"
  defaultValue: undefined
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
  functionType: FunctionType
  functionName: Name
  fields: ArgumentField[]
  defaultValues: unknown[]
}

export type ServiceArgumentsMeta<A = BaseActor> = {
  [K in FunctionName<A>]: MethodArgumentsMeta<A, K>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

export type ArgumentFieldByType<T extends ArgumentFieldType> = Extract<
  ArgumentField,
  { type: T }
>
