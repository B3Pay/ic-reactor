import type { BaseActor, FunctionName } from "@ic-reactor/core"

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
  candidType: string
  defaultValue: unknown
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
  schema?: unknown
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
