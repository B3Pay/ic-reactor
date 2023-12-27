export type ExtractedFieldComponent =
  | "div"
  | "form"
  | "input"
  | "select"
  | "option"
  | "span"
  | "fieldset"

export type ExtractedFieldType =
  | "service"
  | "function"
  | "optional"
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "textarea"
  | "recursive"
  | "reserved"
  | "vector"
  | "record"
  | "variant"
  | "tuple"
  | "null"
  | "empty"
  | "principal"
  | "unknown"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyValue = any

export type ExtraInputFormFields = Partial<{
  required: boolean
  min: number | string
  max: number | string
  maxLength: number
  minLength: number
  valueAsNumber: boolean
}>

export interface ExtractedField extends ExtraInputFormFields {
  component: ExtractedFieldComponent
  type: ExtractedFieldType
  label: string
  options?: string[]
  fields: ExtractedField[]
  defaultValues: AnyValue
  extract?: () => ExtractedField | undefined
  validate: (value: AnyValue) => boolean | string
}
