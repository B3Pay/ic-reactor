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

export type FunctionDefaultValues<M extends string, T = any> = {
  data: {
    [K in `${M}-arg${number}`]: ExtractTypeFromIDLType<T>
  }
}

export type ExtractTypeFromIDLType<T = any> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : any

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

export type ServiceMethodType = "query" | "update"

export type ServiceMethodTypeAndName<A> = [ServiceMethodType, keyof A]

export interface ExtractedService<A> {
  label: string
  methods: {
    [K in keyof A]: ExtractedFunction<A>
  }
  methodNames: ServiceMethodTypeAndName<A>[]
}

export interface ExtractedFunction<A> {
  type: "query" | "update"
  functionName: keyof A & string
  fields: AllExtractableType<IDL.Type<any>>[] | []
  defaultValues: FunctionDefaultValues<keyof A & string>
  validate: (value: any) => boolean | string
}

export interface ExtractedRecord<T extends IDL.Type> extends ExtractedField {
  type: "record"
  fields: DynamicFieldTypeByClass<T>[]
  defaultValues: Record<string, ExtractTypeFromIDLType<T>>
}

export interface ExtractedVariant<T extends IDL.Type> extends ExtractedField {
  type: "variant"
  options: string[]
  fields: DynamicFieldTypeByClass<T>[]
  defaultValue: string
  defaultValues: ExtractTypeFromIDLType<T>
}

export interface ExtractedTuple<T extends IDL.Type> extends ExtractedField {
  type: "tuple"
  fields: DynamicFieldTypeByClass<T>[]
  defaultValues: ExtractTypeFromIDLType<T>[]
}

export interface ExtractedOptional extends ExtractedField {
  type: "optional"
  fields: [DynamicFieldTypeByClass<IDL.Type>]
  defaultValues: []
}

export interface ExtractedVector extends ExtractedField {
  type: "vector"
  fields: DynamicFieldTypeByClass<IDL.Type>[]
  defaultValues: []
}

export interface ExtractedRecursive extends ExtractedField {
  type: "recursive"
  extract: () => DynamicFieldTypeByClass<IDL.Type>
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
