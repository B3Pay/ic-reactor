import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import * as z from "zod"
import type { VisitorDataType, TextFormat, NumberFormat } from "../types"

export type { VisitorDataType, TextFormat, NumberFormat }

// ════════════════════════════════════════════════════════════════════════════
// Component & UI Types
// ════════════════════════════════════════════════════════════════════════════

/**
 * Suggested component type for rendering the field.
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

interface FieldBase<T extends VisitorDataType = VisitorDataType> {
  type: T
  label: string
  displayLabel: string
  name: string
  component: FieldComponentType
  renderHint: RenderHint
  schema: z.ZodTypeAny
  candidType: string
  defaultValue: unknown
}

// ════════════════════════════════════════════════════════════════════════════
// Field Extras
// ════════════════════════════════════════════════════════════════════════════

export interface BlobLimits {
  maxHexBytes: number
  maxFileBytes: number
  maxHexDisplayLength: number
}

export interface BlobValidationResult {
  valid: boolean
  error?: string
}

interface RecordExtras {
  fields: FieldNode[]
  defaultValue: Record<string, unknown>
}

interface VariantExtras {
  fields: FieldNode[]
  defaultOption: string
  defaultValue: Record<string, unknown>
  getOptionDefault: (option: string) => Record<string, unknown>
  getField: (option: string) => FieldNode
  getSelectedOption: (value: Record<string, unknown>) => string
  getSelectedField: (value: Record<string, unknown>) => FieldNode
}

interface TupleExtras {
  fields: FieldNode[]
  defaultValue: unknown[]
}

interface OptionalExtras {
  innerField: FieldNode
  defaultValue: null
  getInnerDefault: () => unknown
  isEnabled: (value: unknown) => boolean
}

interface VectorExtras {
  itemField: FieldNode
  defaultValue: unknown[]
  getItemDefault: () => unknown
  createItemField: (index: number, overrides?: { label?: string }) => FieldNode
}

interface BlobExtras {
  itemField: FieldNode
  acceptedFormats: ("hex" | "base64" | "file")[]
  limits: BlobLimits
  normalizeHex: (input: string) => string
  validateInput: (value: string | Uint8Array) => BlobValidationResult
  defaultValue: string
}

interface RecursiveExtras {
  typeName: string
  extract: () => FieldNode
  getInnerDefault: () => unknown
  defaultValue: undefined
}

interface PrincipalExtras {
  maxLength: number
  minLength: number
  format: TextFormat
  inputProps: PrimitiveInputProps
  defaultValue: string
}

interface NumberExtras {
  unsigned: boolean
  isFloat: boolean
  bits?: number
  min?: string
  max?: string
  format: NumberFormat
  inputProps: PrimitiveInputProps
  defaultValue: string
}

interface TextExtras {
  minLength?: number
  maxLength?: number
  multiline?: boolean
  format: TextFormat
  inputProps: PrimitiveInputProps
  defaultValue: string
}

interface BooleanExtras {
  inputProps: PrimitiveInputProps
  defaultValue: boolean
}

interface NullExtras {
  defaultValue: null
}

interface UnknownExtras {
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

export interface ArgumentsMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  functionType: FunctionType
  functionName: Name
  fields: FieldNode[]
  defaultValues: unknown[]
  schema: z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]]>
  argCount: number
  isNoArgs: boolean
}

export interface FormOptions {
  defaultValues: unknown[]
  validators: {
    onChange: z.ZodTypeAny
    onBlur: z.ZodTypeAny
  }
}

export type ArgumentsServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]: ArgumentsMeta<A, K>
}

// ════════════════════════════════════════════════════════════════════════════
// Type Utilities
// ════════════════════════════════════════════════════════════════════════════

export type FieldByType<T extends VisitorDataType> = Extract<
  FieldNode,
  { type: T }
>

export type FieldProps<T extends VisitorDataType> = {
  field: FieldByType<T>
  renderField?: (child: FieldNode) => React.ReactNode
}

export type CompoundField =
  | RecordField
  | VariantField
  | TupleField
  | OptionalField
  | VectorField
  | RecursiveField

export type PrimitiveField =
  | PrincipalField
  | NumberField
  | TextField
  | BooleanField
  | NullField

export type ComponentMap<
  TComponents extends Record<FieldComponentType, unknown>,
> = {
  [K in FieldComponentType]: TComponents[K]
}

export type GetComponentType<
  TMap extends Partial<Record<FieldComponentType, unknown>>,
  TKey extends FieldComponentType,
> = TKey extends keyof TMap ? TMap[TKey] : never
