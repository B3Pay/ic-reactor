import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import * as z from "zod"

// ════════════════════════════════════════════════════════════════════════════
// Component & UI Types
// ════════════════════════════════════════════════════════════════════════════

/**
 * Suggested component type for rendering friendly form fields.
 */
export type FormFieldComponentType =
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
export type FormInputType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "file"
  | "textarea"

/**
 * Rendering hints for the UI.
 */
export interface FormRenderHint {
  isCompound: boolean
  isPrimitive: boolean
  inputType?: FormInputType
}

// ════════════════════════════════════════════════════════════════════════════
// Field Types
// ════════════════════════════════════════════════════════════════════════════

export type FormFieldType =
  | "record"
  | "tuple"
  | "variant"
  | "optional"
  | "vector"
  | "blob"
  | "principal"
  | "text"
  | "number"
  | "boolean"
  | "null"
  | "recursive"
  | "unknown"

// ════════════════════════════════════════════════════════════════════════════
// Base Field Interface
// ════════════════════════════════════════════════════════════════════════════

/**
 * Base properties shared by all friendly form field nodes.
 */
interface FormFieldBase<T extends FormFieldType = FormFieldType> {
  type: T
  label: string
  displayLabel: string
  name: string
  component: FormFieldComponentType
  renderHint: FormRenderHint
  schema: z.ZodTypeAny
  candidType: string
  defaultValue: unknown
}

// ════════════════════════════════════════════════════════════════════════════
// Field Extras - Type-Specific Properties
// ════════════════════════════════════════════════════════════════════════════

interface FormRecordExtras {
  fields: FormFieldNode[]
  defaultValue: Record<string, unknown>
}

interface FormTupleExtras {
  fields: FormFieldNode[]
  defaultValue: unknown[]
}

interface FormVariantExtras {
  options: FormFieldNode[]
  defaultOption: string
  defaultValue: Record<string, unknown>
  getOptionDefault: (option: string) => Record<string, unknown>
  getOption: (option: string) => FormFieldNode
  getSelectedKey: (value: Record<string, unknown>) => string
  getSelectedOption: (value: Record<string, unknown>) => FormFieldNode
}

interface FormOptionalExtras {
  innerField: FormFieldNode
  defaultValue: null
  getInnerDefault: () => unknown
  isEnabled: (value: unknown) => boolean
}

interface FormVectorExtras {
  itemField: FormFieldNode
  defaultValue: unknown[]
  getItemDefault: () => unknown
  createItemField: (
    index: number,
    overrides?: { label?: string }
  ) => FormFieldNode
}

interface FormBlobExtras {
  defaultValue: string
}

interface FormRecursiveExtras {
  typeName: string
  extract: () => FormFieldNode
  defaultValue: undefined
}

interface FormPrincipalExtras {
  defaultValue: string
}

interface FormTextExtras {
  defaultValue: string
}

interface FormNumberExtras {
  defaultValue: string
}

interface FormBooleanExtras {
  defaultValue: boolean
}

interface FormNullExtras {
  defaultValue: null
}

interface FormUnknownExtras {
  defaultValue: null
}

type FormFieldExtras<T extends FormFieldType> = T extends "record"
  ? FormRecordExtras
  : T extends "tuple"
    ? FormTupleExtras
    : T extends "variant"
      ? FormVariantExtras
      : T extends "optional"
        ? FormOptionalExtras
        : T extends "vector"
          ? FormVectorExtras
          : T extends "blob"
            ? FormBlobExtras
            : T extends "recursive"
              ? FormRecursiveExtras
              : T extends "principal"
                ? FormPrincipalExtras
                : T extends "text"
                  ? FormTextExtras
                  : T extends "number"
                    ? FormNumberExtras
                    : T extends "boolean"
                      ? FormBooleanExtras
                      : T extends "null"
                        ? FormNullExtras
                        : T extends "unknown"
                          ? FormUnknownExtras
                          : {}

/**
 * A unified friendly field node that contains all metadata needed for rendering.
 */
export type FormFieldNode<T extends FormFieldType = FormFieldType> =
  T extends any ? FormFieldBase<T> & FormFieldExtras<T> : never

export type FormRecordField = FormFieldNode<"record">
export type FormTupleField = FormFieldNode<"tuple">
export type FormVariantField = FormFieldNode<"variant">
export type FormOptionalField = FormFieldNode<"optional">
export type FormVectorField = FormFieldNode<"vector">
export type FormBlobField = FormFieldNode<"blob">
export type FormRecursiveField = FormFieldNode<"recursive">
export type FormPrincipalField = FormFieldNode<"principal">
export type FormTextField = FormFieldNode<"text">
export type FormNumberField = FormFieldNode<"number">
export type FormBooleanField = FormFieldNode<"boolean">
export type FormNullField = FormFieldNode<"null">
export type FormUnknownField = FormFieldNode<"unknown">

// ════════════════════════════════════════════════════════════════════════════
// Form Metadata
// ════════════════════════════════════════════════════════════════════════════

export type FriendlyFunctionType = FunctionType | "value"

/**
 * Metadata for a method/value's friendly input arguments.
 */
export interface FormArgumentsMeta {
  candidType: string
  functionType: FriendlyFunctionType
  functionName: string
  args: FormFieldNode[]
  defaults: unknown[]
  schema: z.ZodTypeAny
  argCount: number
  isEmpty: boolean
}

/**
 * Service-level metadata mapping method names to their friendly argument metadata.
 */
export type FormServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]?: FormArgumentsMeta
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract field type by FormFieldType.
 */
export type FormFieldByType<T extends FormFieldType> = Extract<
  FormFieldNode,
  { type: T }
>

/** Compound field types that contain other fields */
export type FormCompoundField =
  | FormRecordField
  | FormTupleField
  | FormVariantField
  | FormOptionalField
  | FormVectorField
  | FormRecursiveField

/** Primitive field types with direct values */
export type FormPrimitiveField =
  | FormBlobField
  | FormPrincipalField
  | FormTextField
  | FormNumberField
  | FormBooleanField
  | FormNullField
  | FormUnknownField

// ════════════════════════════════════════════════════════════════════════════
// Variable References
// ════════════════════════════════════════════════════════════════════════════

export interface VariableRefCandidate {
  expr: string
  label: string
  candidType: string
  fieldType: FormFieldType
  sourceNodeId: string
  sourceRoot?: "arg" | "ret"
}

export type ExprHydration =
  | { status: "empty" }
  | { status: "hydrated"; values: unknown[] }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string }

export type MethodMetadataOptions = {
  candidArgsHex?: string
  skipHydrationIfContains?: string
}

export type CandidFormMetadata = {
  meta: FormArgumentsMeta
  hydration: ExprHydration
}
