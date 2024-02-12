import { IDL } from "@dfinity/candid"
import type {
  DefaultActorType,
  FunctionName,
  FunctionType,
} from "@ic-reactor/store"
import type { FieldType } from "../../types"

export interface ExtractedServiceFields<A = DefaultActorType> {
  canisterId: string
  methodFields: ServiceFields<A>
}

export type ServiceFields<A = DefaultActorType> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export type ServiceDefaultValues<A = DefaultActorType> = {
  [K in FunctionName<A>]: MethodDefaultValues<K>
}

export type MethodDefaultValues<T = string> = {
  [key: `arg${number}`]: FieldTypeFromIDLType<T>
}

export interface MethodFields<A = DefaultActorType> {
  functionName: FunctionName<A>
  functionType: FunctionType
  returnTypes: IDL.Type<any>[]
  argTypes: IDL.Type<any>[]
  fields: AllFieldTypes<IDL.Type<any>>[] | []
  validate: (value: any) => boolean | string
  defaultValues: ServiceDefaultValues<A>
}

export interface RecordFields<T extends IDL.Type> extends DefaultField {
  type: "record"
  fields: AllFieldTypes<T>[]
  defaultValues: Record<string, FieldTypeFromIDLType<T>>
}

export interface VariantFields<T extends IDL.Type> extends DefaultField {
  type: "variant"
  options: string[]
  defaultValue: string
  fields: AllFieldTypes<T>[]
  defaultValues: FieldTypeFromIDLType<T>
}

export interface TupleFields<T extends IDL.Type> extends DefaultField {
  type: "tuple"
  fields: AllFieldTypes<T>[]
  defaultValues: FieldTypeFromIDLType<T>[]
}

export interface OptionalFields extends DefaultField {
  type: "optional"
  field: AllFieldTypes<IDL.Type>
  defaultValue: []
}

export interface VectorFields extends DefaultField {
  type: "vector"
  field: AllFieldTypes<IDL.Type>
  defaultValue: []
}

export interface RecursiveFields extends DefaultField {
  type: "recursive"
  name: string
  extract: () => VariantFields<IDL.Type>
}

export interface PrincipalField extends DefaultField {
  type: "principal"
  required: true
  maxLength: number
  minLength: number
  defaultValue: string
}

export interface NumberField extends DefaultField {
  type: "number"
  min?: number | string
  max?: number | string
  required: true
  defaultValue: string
}

export interface InputField<T extends IDL.Type> extends DefaultField {
  required: true
  defaultValue: FieldTypeFromIDLType<T>
}

export type DynamicFieldType<T extends FieldType = any> = T extends "record"
  ? RecordFields<IDL.Type>
  : T extends "variant"
  ? VariantFields<IDL.Type>
  : T extends "tuple"
  ? TupleFields<IDL.Type>
  : T extends "optional"
  ? OptionalFields
  : T extends "vector"
  ? VectorFields
  : T extends "recursive"
  ? RecursiveFields
  : T extends "unknown"
  ? InputField<IDL.Type>
  : T extends "text"
  ? InputField<IDL.TextClass>
  : T extends "number"
  ? NumberField
  : T extends "principal"
  ? PrincipalField
  : T extends "boolean"
  ? InputField<IDL.BoolClass>
  : T extends "null"
  ? InputField<IDL.NullClass>
  : never

export type DynamicFieldTypeByClass<T extends IDL.Type> =
  T extends IDL.RecordClass
    ? RecordFields<T>
    : T extends IDL.TupleClass<any>
    ? TupleFields<T>
    : T extends IDL.VariantClass
    ? VariantFields<T>
    : T extends IDL.VecClass<any>
    ? VectorFields
    : T extends IDL.OptClass<any>
    ? OptionalFields
    : T extends IDL.RecClass<any>
    ? RecursiveFields
    : T extends IDL.PrincipalClass
    ? PrincipalField
    : T extends AllNumberTypes
    ? NumberField
    : InputField<T>

export type AllNumberTypes =
  | IDL.NatClass
  | IDL.IntClass
  | IDL.NatClass
  | IDL.FixedNatClass
  | IDL.FixedIntClass
  | IDL.FloatClass

export type AllFieldTypes<T extends IDL.Type> =
  | RecordFields<T>
  | TupleFields<T>
  | VariantFields<T>
  | VectorFields
  | OptionalFields
  | RecursiveFields
  | PrincipalField
  | NumberField
  | InputField<T>

export type FieldTypeFromIDLType<T = any> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : any

export type ExtraInputFormFields = Partial<{
  maxLength: number
  minLength: number
}>

export interface DefaultField extends ExtraInputFormFields {
  type: FieldType
  label: string
  validate: (value: any) => boolean | string
  defaultValue?: any
  defaultValues?: any
}