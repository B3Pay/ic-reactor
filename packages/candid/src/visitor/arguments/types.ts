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

/**
 * Rendering hints for the UI.
 * Eliminates the need for frontend to maintain COMPLEX_TYPES arrays.
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

interface FieldBase<T extends VisitorDataType = VisitorDataType> {
  /** The field type */
  type: T
  /** Raw label from Candid: "__arg0", "_0_" */
  label: string
  /** Pre-formatted display label for UI rendering */
  displayLabel: string
  /** Form field name path for binding */
  name: string
  /** Suggested component type for rendering this field */
  component: FieldComponentType
  /** Rendering hints for UI strategy */
  renderHint: RenderHint
  /** Zod schema for field validation */
  schema: z.ZodTypeAny
  /** Original Candid type name for reference */
  candidType: string
}

// ════════════════════════════════════════════════════════════════════════════
// Type-Specific Extras
// ════════════════════════════════════════════════════════════════════════════

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

type FieldExtras<T extends VisitorDataType> = T extends "record"
  ? {
      /** Child fields in the record */
      fields: FieldNode[]
      /** Map of field label to its metadata for quick lookup */
      fieldMap: Map<string, FieldNode>
      defaultValue: Record<string, unknown>
    }
  : T extends "variant"
    ? {
        /** All variant option fields */
        fields: FieldNode[]
        /** List of variant option names */
        options: string[]
        /** Default selected option */
        defaultOption: string
        /** Map of option name to its field metadata */
        optionMap: Map<string, FieldNode>
        defaultValue: Record<string, unknown>
        /** Get default value for a specific option */
        getOptionDefault: (option: string) => Record<string, unknown>
        /** Get the field for a specific option */
        getField: (option: string) => FieldNode
        /** Get the currently selected option from a value */
        getSelectedOption: (value: Record<string, unknown>) => string
        /** Get the selected field from a value */
        getSelectedField: (value: Record<string, unknown>) => FieldNode
      }
    : T extends "tuple"
      ? {
          /** Tuple element fields in order */
          fields: FieldNode[]
          defaultValue: unknown[]
        }
      : T extends "optional"
        ? {
            /** The inner field when value is present */
            innerField: FieldNode
            defaultValue: null
            /** Get default value when enabling the optional */
            getInnerDefault: () => unknown
            /** Check if a value represents an enabled optional */
            isEnabled: (value: unknown) => boolean
          }
        : T extends "vector"
          ? {
              /** Template field for vector items */
              itemField: FieldNode
              defaultValue: unknown[]
              /** Get a new item with default values */
              getItemDefault: () => unknown
              /** Create a properly configured item field for a specific index */
              createItemField: (
                index: number,
                overrides?: { label?: string }
              ) => FieldNode
            }
          : T extends "blob"
            ? {
                /** Item field for individual bytes (nat8) */
                itemField: FieldNode
                /** Accepted input formats */
                acceptedFormats: ("hex" | "base64" | "file")[]
                /** Size limits for blob input */
                limits: BlobLimits
                /** Normalize hex input */
                normalizeHex: (input: string) => string
                /** Validate blob input value */
                validateInput: (
                  value: string | Uint8Array
                ) => BlobValidationResult
                defaultValue: string
              }
            : T extends "recursive"
              ? {
                  /** Type name for the recursive type */
                  typeName: string
                  /** Lazily extract the inner field to prevent infinite loops */
                  extract: () => FieldNode
                  /** Get default value for the recursive type (evaluates lazily) */
                  getInnerDefault: () => unknown
                  defaultValue: undefined
                }
              : T extends "principal"
                ? {
                    maxLength: number
                    minLength: number
                    /** Detected format based on label heuristics */
                    format: TextFormat
                    /** Pre-computed HTML input props */
                    inputProps: PrimitiveInputProps
                    defaultValue: string
                  }
                : T extends "number"
                  ? {
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
                      /** Detected format based on label heuristics */
                      format: NumberFormat
                      /** Pre-computed HTML input props */
                      inputProps: PrimitiveInputProps
                      defaultValue: string
                    }
                  : T extends "text"
                    ? {
                        /** Minimum length constraint */
                        minLength?: number
                        /** Maximum length constraint */
                        maxLength?: number
                        /** Whether to render as multiline textarea */
                        multiline?: boolean
                        /** Detected format based on label heuristics */
                        format: TextFormat
                        /** Pre-computed HTML input props */
                        inputProps: PrimitiveInputProps
                        defaultValue: string
                      }
                    : T extends "boolean"
                      ? {
                          /** Pre-computed HTML input props */
                          inputProps: PrimitiveInputProps
                          defaultValue: boolean
                        }
                      : T extends "null"
                        ? {
                            defaultValue: null
                          }
                        : T extends "unknown"
                          ? {
                              defaultValue: undefined
                            }
                          : {}

/**
 * A unified field node that contains all metadata needed for rendering.
 */
export type FieldNode<T extends VisitorDataType = VisitorDataType> =
  FieldBase<T> & FieldExtras<T>

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
// Form Metadata - TanStack Form Integration
// ════════════════════════════════════════════════════════════════════════════

/**
 * Form metadata for a Candid method.
 * Contains all information needed to create a TanStack Form instance.
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
  fields: FieldNode[]
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
  FieldNode,
  { type: T }
>

/**
 * Props type helper for field components.
 * Use this to type your field components for better DX.
 */
export type FieldProps<T extends ArgumentFieldType> = {
  field: FieldByType<T>
  renderField?: (child: FieldNode) => React.ReactNode
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
