import type { BaseActor, FunctionName } from "@ic-reactor/core"
import * as z from "zod"

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

export type FormInputType =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "file"
  | "textarea"

export interface FormRenderHint {
  isCompound: boolean
  isPrimitive: boolean
  inputType?: FormInputType
}

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

type FieldBase = {
  type: FormFieldType
  label: string
  displayLabel: string
  name: string
  component: FormFieldComponentType
  renderHint: FormRenderHint
  candidType: string
  defaultValue: unknown
  schema: z.ZodTypeAny
}

export type FormFieldNode =
  | (FieldBase & { type: "record"; fields: FormFieldNode[] })
  | (FieldBase & { type: "tuple"; fields: FormFieldNode[] })
  | (FieldBase & {
      type: "variant"
      options: FormFieldNode[]
      defaultOption: string
      getOptionDefault: (option: string) => Record<string, unknown>
      getOption: (option: string) => FormFieldNode
      getSelectedKey: (value: Record<string, unknown>) => string
      getSelectedOption: (value: Record<string, unknown>) => FormFieldNode
    })
  | (FieldBase & {
      type: "optional"
      innerField: FormFieldNode
      getInnerDefault: () => unknown
      isEnabled: (value: unknown) => boolean
    })
  | (FieldBase & {
      type: "vector"
      itemField: FormFieldNode
      getItemDefault: () => unknown
      createItemField: (
        index: number,
        overrides?: { label?: string }
      ) => FormFieldNode
    })
  | (FieldBase & { type: "blob" })
  | (FieldBase & { type: "principal" })
  | (FieldBase & { type: "text" })
  | (FieldBase & { type: "number" })
  | (FieldBase & { type: "boolean" })
  | (FieldBase & { type: "null" })
  | (FieldBase & {
      type: "recursive"
      typeName: string
      extract: () => FormFieldNode
    })
  | (FieldBase & { type: "unknown" })

export type FormArgumentsMeta = {
  candidType: string
  functionType: "query" | "update" | "value"
  functionName: string
  args: FormFieldNode[]
  defaults: unknown[]
  argCount: number
  isEmpty: boolean
  /** Zod validation schema */
  schema: z.ZodTypeAny
}

export type FriendlyServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]?: FormArgumentsMeta
}

export type VariableRefCandidate = {
  expr: string
  label: string
  candidType: string
  fieldType: FormFieldType
  sourceNodeId: string
  sourceRoot?: "arg" | "ret"
}
