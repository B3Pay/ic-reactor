import { IDL } from "@dfinity/candid"

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

export type FunctionDefaultValues<M extends string, T = any> = {
  data: {
    [K in `${M}-arg${number}`]: ExtractTypeFromIDLType<T>
  }
}

export type ExtractTypeFromIDLType<T = any> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : any

export type AllExtractableType<T extends IDL.Type> =
  | ExtractedRecord<T>
  | ExtractedTuple<T>
  | ExtractedVariant<T>
  | ExtractedVector
  | ExtractedOptional
  | ExtractedRecursive
  | ExtractedPrincipalField
  | ExtractedNumberField
  | ExtractedInputField<T>

export type DynamicFieldType<T extends IDL.Type> = T extends IDL.RecordClass
  ? ExtractedRecord<T>
  : T extends IDL.TupleClass<any>
  ? ExtractedTuple<T>
  : T extends IDL.VariantClass
  ? ExtractedVariant<T>
  : T extends IDL.VecClass<any>
  ? ExtractedVector
  : T extends IDL.OptClass<any>
  ? ExtractedOptional
  : T extends IDL.RecClass<any>
  ? ExtractedRecursive
  : T extends IDL.PrincipalClass
  ? ExtractedPrincipalField
  : T extends
      | IDL.NatClass
      | IDL.IntClass
      | IDL.NatClass
      | IDL.FixedNatClass
      | IDL.FixedIntClass
      | IDL.FloatClass
  ? ExtractedNumberField
  : ExtractedInputField<T>

export type ExtraInputFormFields = Partial<{
  required: boolean
  maxLength: number
  minLength: number
}>

export interface ExtractedField extends ExtraInputFormFields {
  type: ExtractedFieldType
  label: string
  validate: (value: any) => boolean | string
}

export interface ExtractedService<A> extends ExtractedField {
  type: "service"
  fields: ExtractedFunction<A>[]
}

export interface ExtractedFunction<A> extends ExtractedField {
  type: "function"
  label: "query" | "update"
  functionName: keyof A & string
  fields: AllExtractableType<IDL.Type<any>>[] | []
  defaultValues: FunctionDefaultValues<keyof A & string>
}

export interface ExtractedRecord<T extends IDL.Type> extends ExtractedField {
  type: "record"
  fields: DynamicFieldType<T>[]
  defaultValues: Record<string, ExtractTypeFromIDLType<T>>
}

export interface ExtractedVariant<T extends IDL.Type> extends ExtractedField {
  type: "variant"
  options: string[]
  fields: DynamicFieldType<T>[]
  defaultValues: Record<string, ExtractTypeFromIDLType<T>>
}

export interface ExtractedTuple<T extends IDL.Type> extends ExtractedField {
  type: "tuple"
  fields: DynamicFieldType<T>[]
  defaultValues: ExtractTypeFromIDLType<T>[]
}

export interface ExtractedOptional extends ExtractedField {
  type: "optional"
  fields: [DynamicFieldType<IDL.Type>]
  defaultValues: []
}

export interface ExtractedVector extends ExtractedField {
  type: "vector"
  fields: DynamicFieldType<IDL.Type>[]
  defaultValues: []
}

export interface ExtractedRecursive extends ExtractedField {
  type: "recursive"
  extract: () => DynamicFieldType<IDL.Type>
  defaultValues: undefined
}

export interface ExtractedInputField<T extends IDL.Type>
  extends ExtractedField {
  type: ExtractedFieldType
  label: string
  validate: (value: any) => boolean | string
  defaultValues: ExtractTypeFromIDLType<T>
}

export interface ExtractedPrincipalField extends ExtractedField {
  type: ExtractedFieldType
  label: string
  maxLength: number
  minLength: number
  validate: (value: any) => boolean | string
  defaultValues: undefined
}

export interface ExtractedNumberField extends ExtractedField {
  type: ExtractedFieldType
  label: string
  min?: number | string
  max?: number | string
  valueAsNumber?: boolean
  validate: (value: any) => boolean | string
  defaultValues: undefined
}
