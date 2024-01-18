import { IDL } from "@dfinity/candid"

export type ExtractedFieldType =
  | "record"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "recursive"
  | "unknown"
  | "text"
  | "number"
  | "principal"
  | "boolean"
  | "null"

export type DynamicFieldType<T extends ExtractedFieldType = any> =
  T extends "record"
    ? ExtractedRecord<IDL.Type>
    : T extends "variant"
    ? ExtractedVariant<IDL.Type>
    : T extends "tuple"
    ? ExtractedTuple<IDL.Type>
    : T extends "optional"
    ? ExtractedOptional
    : T extends "vector"
    ? ExtractedVector
    : T extends "recursive"
    ? ExtractedRecursive
    : T extends "unknown"
    ? ExtractedInputField<IDL.Type>
    : T extends "text"
    ? ExtractedInputField<IDL.TextClass>
    : T extends "number"
    ? ExtractedNumberField
    : T extends "principal"
    ? ExtractedPrincipalField
    : T extends "boolean"
    ? ExtractedInputField<IDL.BoolClass>
    : T extends "null"
    ? ExtractedInputField<IDL.NullClass>
    : never

export type DynamicFieldTypeByClass<T extends IDL.Type> =
  T extends IDL.RecordClass
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

export type FunctionDefaultValues<T> = {
  [key: `arg${number}`]: ExtractTypeFromIDLType<T>
}
export type FunctionMethodDetails<T> = {
  title: string
  description: string
  [key: `arg${number}`]: ExtractTypeFromIDLType<T>
}

export type ExtractTypeFromIDLType<T = any> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : any

export type ExtraInputFormFields = Partial<{
  maxLength: number
  minLength: number
}>

export interface ExtractedField extends ExtraInputFormFields {
  type: ExtractedFieldType
  label: string
  description: string
  validate: (value: any) => boolean | string
  defaultValue?: any
  defaultValues?: any
  childDetails?: MethodDetails | Record<string, MethodDetails>
}

export type ServiceMethodType = "query" | "update"

export type ServiceMethodTypeAndName<A> = {
  type: ServiceMethodType
  functionName: keyof A
}

export interface MethodDetails {
  label: string
  description: string
}

export interface ExtractedService<A> {
  canisterId: string
  description: string
  methodNames: ServiceMethodTypeAndName<A>[]
  methodFields: {
    [K in keyof A]: ExtractedFunction<A>
  }
  methodDetails: FunctionMethodDetails<keyof A & string>[]
}

export interface ExtractedFunction<A> {
  type: "query" | "update"
  functionName: keyof A & string
  fields: AllExtractableType<IDL.Type<any>>[] | []
  validate: (value: any) => boolean | string
  defaultValues: FunctionDefaultValues<keyof A>
  childDetails: FunctionMethodDetails<keyof A>
}

export interface ExtractedRecord<T extends IDL.Type> extends ExtractedField {
  type: "record"
  fields: AllExtractableType<T>[]
  defaultValues: Record<string, ExtractTypeFromIDLType<T>>
}

export interface ExtractedVariant<T extends IDL.Type> extends ExtractedField {
  type: "variant"
  options: string[]
  fields: AllExtractableType<T>[]
  defaultValue: string
  defaultValues: ExtractTypeFromIDLType<T>
}

export interface ExtractedTuple<T extends IDL.Type> extends ExtractedField {
  type: "tuple"
  fields: AllExtractableType<T>[]
  defaultValues: ExtractTypeFromIDLType<T>[]
}

export interface ExtractedOptional extends ExtractedField {
  type: "optional"
  field: AllExtractableType<IDL.Type>
  defaultValue: []
}

export interface ExtractedVector extends ExtractedField {
  type: "vector"
  field: AllExtractableType<IDL.Type>
  defaultValue: []
}

export interface ExtractedRecursive extends ExtractedField {
  type: "recursive"
  extract: () => AllExtractableType<IDL.Type>
}

export interface ExtractedPrincipalField extends ExtractedField {
  type: "principal"
  label: string
  description: string
  maxLength: number
  minLength: number
  defaultValue: string
}

export interface ExtractedNumberField extends ExtractedField {
  type: "number"
  label: string
  description: string
  min?: number | string
  max?: number | string
  valueAsNumber: boolean
  defaultValue: undefined
}

export interface ExtractedInputField<T extends IDL.Type>
  extends ExtractedField {
  label: string
  description: string
  defaultValue: ExtractTypeFromIDLType<T>
}
