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

export type ExtractTypeFromIDLType<T = any> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : any

export type ExtraInputFormFields = Partial<{
  maxLength: number
  minLength: number
}>

export interface ExtractedField extends ExtraInputFormFields {
  type: ExtractedFieldType
  validate: (value: any) => boolean | string
  defaultValue?: any
  defaultValues?: any
}

export type ServiceFieldDetails<A> = {
  [K in keyof A]: FunctionDetails<A>
}

export type ServiceMethodFields<A> = {
  [K in keyof A]: ExtractedFunction<A>
}

export type ServiceDefaultValues<A> = {
  [K in keyof A]: FunctionDefaultValues<K>
}

export interface FieldDetails {
  label: string
  description: string
}

export interface FieldDetailsWithChild {
  label: string
  description: string
  child:
    | FieldDetails
    | FieldDetailsWithChild
    | Record<string, FieldDetailsWithChild | FieldDetails>
    | FieldDetailsWithChild[]
    | FieldDetails[]
}

export interface ExtractedService<A> {
  canisterId: string
  description: string
  methodFields: ServiceMethodFields<A>
  methodDetails: ServiceFieldDetails<A>
}

export type FunctionType = "query" | "update"

export type FunctionDetails<A> = {
  order: number
  type: FunctionType
  functionName: keyof A
  label: string
  description: string
  child: Record<string, FieldDetailsWithChild | FieldDetails>
  [key: `arg${number}`]: FieldDetailsWithChild
}

export type FunctionDefaultValues<T> = {
  [key: `arg${number}`]: ExtractTypeFromIDLType<T>
}

export interface ExtractedFunction<A> {
  type: "query" | "update"
  fields: AllExtractableType<IDL.Type<any>>[] | []
  validate: (value: any) => boolean | string
  functionName: keyof A
  defaultValues: ServiceDefaultValues<A>
  details: ServiceFieldDetails<A>
}

export interface ExtractedRecord<T extends IDL.Type> extends ExtractedField {
  type: "record"
  details: FieldDetailsWithChild
  fields: AllExtractableType<T>[]
  defaultValues: Record<string, ExtractTypeFromIDLType<T>>
}

export interface ExtractedVariant<T extends IDL.Type> extends ExtractedField {
  type: "variant"
  options: string[]
  defaultValue: string
  details: FieldDetailsWithChild
  fields: AllExtractableType<T>[]
  defaultValues: ExtractTypeFromIDLType<T>
}

export interface ExtractedTuple<T extends IDL.Type> extends ExtractedField {
  type: "tuple"
  details: FieldDetailsWithChild
  fields: AllExtractableType<T>[]
  defaultValues: ExtractTypeFromIDLType<T>[]
}

export interface ExtractedOptional extends ExtractedField {
  type: "optional"
  details: FieldDetailsWithChild
  field: AllExtractableType<IDL.Type>
  defaultValue: []
}

export interface ExtractedVector extends ExtractedField {
  type: "vector"
  details: FieldDetailsWithChild
  field: AllExtractableType<IDL.Type>
  defaultValue: []
}

export interface ExtractedRecursive extends ExtractedField {
  type: "recursive"
  details: FieldDetailsWithChild
  extract: () => AllExtractableType<IDL.Type>
}

export interface ExtractedPrincipalField extends ExtractedField {
  type: "principal"
  details: FieldDetails
  required: true
  maxLength: number
  minLength: number
  defaultValue: string
}

export interface ExtractedNumberField extends ExtractedField {
  type: "number"
  details: FieldDetails
  min?: number | string
  max?: number | string
  required: true
  valueAsNumber: boolean
  defaultValue: undefined
}

export interface ExtractedInputField<T extends IDL.Type>
  extends ExtractedField {
  details: FieldDetails
  required: true
  defaultValue: ExtractTypeFromIDLType<T>
}
