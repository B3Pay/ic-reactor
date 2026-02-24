import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import * as z from "zod"
import type { VisitorDataType, TextFormat, NumberFormat } from "../types"

export type { VisitorDataType, TextFormat, NumberFormat }

// ════════════════════════════════════════════════════════════════════════════
// Custom Error Class
// ════════════════════════════════════════════════════════════════════════════

/**
 * Custom error class for metadata-related errors.
 * Provides additional context about the field path and Candid type.
 */
export class MetadataError extends Error {
  constructor(
    message: string,
    public readonly fieldPath?: string,
    public readonly candidType?: string
  ) {
    super(message)
    this.name = "MetadataError"
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Component & UI Types
// ════════════════════════════════════════════════════════════════════════════

/**
 * Suggested component type for rendering the field.
 * Use this to map field types to your UI components.
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

/**
 * Input type hints for HTML input elements.
 */
export type InputType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "file"
  | "textarea"

/**
 * Rendering hints for the UI.
 */
export interface RenderHint {
  isCompound: boolean
  isPrimitive: boolean
  inputType?: InputType
  description?: string
}

/**
 * Pre-computed HTML input props for primitive fields.
 */
export interface PrimitiveInputProps {
  type?: "text" | "number" | "checkbox" | "email" | "url" | "tel"
  placeholder?: string
  min?: string | number
  max?: string | number
  step?: string | number
  pattern?: string
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "url"
  autoComplete?: string
  spellCheck?: boolean
  minLength?: number
  maxLength?: number
}

// ════════════════════════════════════════════════════════════════════════════
// Base Field Interface
// ════════════════════════════════════════════════════════════════════════════

/**
 * Base properties shared by all field nodes.
 */
interface FieldBase<T extends VisitorDataType = VisitorDataType> {
  /** The Candid type category (record, variant, text, number, etc.) */
  type: T
  /** Raw label from Candid definition */
  label: string
  /** Human-readable formatted label for display */
  displayLabel: string
  /** Form path compatible with TanStack Form (e.g., "[0]", "[0].owner") */
  name: string
  /** Suggested component type for rendering */
  component: FieldComponentType
  /** UI rendering hints */
  renderHint: RenderHint
  /** Zod validation schema */
  schema: z.ZodTypeAny
  /** Original Candid type name */
  candidType: string
  /** Default value for form initialization */
  defaultValue: unknown
}

// ════════════════════════════════════════════════════════════════════════════
// Field Extras - Type-Specific Properties
// ════════════════════════════════════════════════════════════════════════════

/** Blob upload limits configuration */
export interface BlobLimits {
  maxHexBytes: number
  maxFileBytes: number
  maxHexDisplayLength: number
}

/** Blob validation result */
export interface BlobValidationResult {
  valid: boolean
  error?: string
}

interface RecordExtras {
  /** Child fields of the record */
  fields: FieldNode[]
  /** Default value as object with all field defaults */
  defaultValue: Record<string, unknown>
}

interface VariantExtras {
  /** All variant options as fields */
  options: FieldNode[]
  /** The default selected option key */
  defaultOption: string
  /** Default value with the first option selected */
  defaultValue: Record<string, unknown>
  /** Get default value for a specific option */
  getOptionDefault: (option: string) => Record<string, unknown>
  /** Get field descriptor for a specific option */
  getOption: (option: string) => FieldNode
  /** Get currently selected option key from a value */
  getSelectedKey: (value: Record<string, unknown>) => string
  /** Get the field for the currently selected option */
  getSelectedOption: (value: Record<string, unknown>) => FieldNode
}

interface TupleExtras {
  /** Tuple element fields */
  fields: FieldNode[]
  /** Default value as array of element defaults */
  defaultValue: unknown[]
}

interface OptionalExtras {
  /** The inner type field */
  innerField: FieldNode
  /** Default value is always null */
  defaultValue: null
  /** Get default value of the inner type when enabling */
  getInnerDefault: () => unknown
  /** Check if a value represents an enabled optional */
  isEnabled: (value: unknown) => boolean
}

interface VectorExtras {
  /** Template field for vector items */
  itemField: FieldNode
  /** Default value is empty array */
  defaultValue: unknown[]
  /** Get default value for a new item */
  getItemDefault: () => unknown
  /** Create a field node for an item at a specific index */
  createItemField: (index: number, overrides?: { label?: string }) => FieldNode
}

interface BlobExtras {
  /** Template field for blob bytes */
  itemField: FieldNode
  /** Accepted input formats */
  acceptedFormats: ("hex" | "base64" | "file")[]
  /** Upload limits */
  limits: BlobLimits
  /** Normalize hex input string */
  normalizeHex: (input: string) => string
  /** Validate blob input */
  validateInput: (value: string | Uint8Array) => BlobValidationResult
  /** Default value is empty string */
  defaultValue: string
}

interface RecursiveExtras {
  /** The recursive type name */
  typeName: string
  /** Lazily extract the inner type */
  extract: () => FieldNode
  /** Get default value of the inner type */
  getInnerDefault: () => unknown
  /** Default value is undefined */
  defaultValue: undefined
}

interface PrincipalExtras {
  /** Maximum Principal string length */
  maxLength: number
  /** Minimum Principal string length */
  minLength: number
  /** Detected text format */
  format: TextFormat
  /** Pre-computed HTML input props */
  inputProps: PrimitiveInputProps
  /** Default value is empty string */
  defaultValue: string
}

interface NumberExtras {
  /** Whether the number is unsigned (nat vs int) */
  unsigned: boolean
  /** Whether the number is a float */
  isFloat: boolean
  /** Bit width (8, 16, 32, 64) */
  bits?: number
  /** Minimum value as string */
  min?: string
  /** Maximum value as string */
  max?: string
  /** Detected number format */
  format: NumberFormat
  /** Pre-computed HTML input props */
  inputProps: PrimitiveInputProps
  /** Default value is empty string */
  defaultValue: string
}

interface TextExtras {
  /** Minimum text length */
  minLength?: number
  /** Maximum text length */
  maxLength?: number
  /** Whether to use multiline input */
  multiline?: boolean
  /** Detected text format */
  format: TextFormat
  /** Pre-computed HTML input props */
  inputProps: PrimitiveInputProps
  /** Default value is empty string */
  defaultValue: string
}

interface BooleanExtras {
  /** Pre-computed HTML input props */
  inputProps: PrimitiveInputProps
  /** Default value is false */
  defaultValue: boolean
}

interface NullExtras {
  /** Default value is null */
  defaultValue: null
}

interface UnknownExtras {
  /** Default value is undefined */
  defaultValue: undefined
}

type FieldExtras<T extends VisitorDataType> = T extends "record"
  ? RecordExtras
  : T extends "variant"
    ? VariantExtras
    : T extends "tuple"
      ? TupleExtras
      : T extends "optional"
        ? OptionalExtras
        : T extends "vector"
          ? VectorExtras
          : T extends "blob"
            ? BlobExtras
            : T extends "recursive"
              ? RecursiveExtras
              : T extends "principal"
                ? PrincipalExtras
                : T extends "number"
                  ? NumberExtras
                  : T extends "text"
                    ? TextExtras
                    : T extends "boolean"
                      ? BooleanExtras
                      : T extends "null"
                        ? NullExtras
                        : T extends "unknown"
                          ? UnknownExtras
                          : {}

/**
 * A unified field node that contains all metadata needed for rendering.
 */
export type FieldNode<T extends VisitorDataType = VisitorDataType> =
  T extends any ? FieldBase<T> & FieldExtras<T> : never

export type RecordField = FieldNode<"record">
export type VariantField = FieldNode<"variant">
export type TupleField = FieldNode<"tuple">
export type OptionalField = FieldNode<"optional">
export type VectorField = FieldNode<"vector">
export type BlobField = FieldNode<"blob">
export type RecursiveField = FieldNode<"recursive">
export type PrincipalField = FieldNode<"principal">
export type NumberField = FieldNode<"number">
export type TextField = FieldNode<"text">
export type BooleanField = FieldNode<"boolean">
export type NullField = FieldNode<"null">
export type UnknownField = FieldNode<"unknown">

// ════════════════════════════════════════════════════════════════════════════
// Form Metadata
// ════════════════════════════════════════════════════════════════════════════

/**
 * Metadata for a single method's input arguments.
 * Use this to generate dynamic forms for calling canister methods.
 */
export interface ArgumentsMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  /** Whether this is a "query" or "update" call */
  functionType: FunctionType
  /** The method name as defined in the Candid interface */
  functionName: Name
  /** Array of field descriptors, one per argument */
  args: FieldNode[]
  /** Default values suitable for form initialization */
  defaults: unknown[]
  /** Zod schema for validating all arguments together */
  schema: z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]]>
  /** Number of arguments (0 for no-arg methods) */
  argCount: number
  /** True if this method takes no arguments */
  isEmpty: boolean
}

/**
 * Service-level metadata mapping method names to their argument metadata.
 */
export type ArgumentsServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]: ArgumentsMeta<A, K>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract field type by VisitorDataType.
 */
export type FieldByType<T extends VisitorDataType> = Extract<
  FieldNode,
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

/** Primitive field types with direct values */
export type PrimitiveField =
  | PrincipalField
  | NumberField
  | TextField
  | BooleanField
  | NullField
