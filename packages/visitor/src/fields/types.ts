import { IDL } from "@dfinity/candid"
import type {
  DefaultActorType,
  FunctionName,
  FunctionType,
} from "@ic-reactor/store"
import { FieldType } from "../types"

export interface ExtractedServiceFields<A = DefaultActorType> {
  canisterId: string
  methodFields: ServiceFields<A>
}

export type ServiceFields<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> = {
  [key in M]: <ExtractorClass extends IDL.Visitor<unknown, unknown>>(
    extractorClass?: ExtractorClass
  ) => MethodFields<A, M>
}

export interface MethodFields<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> {
  functionName: M
  functionType: FunctionType
  fields: AllFieldTypes<IDL.Type>[] | []
  validate: (value: FieldTypeFromIDLType<IDL.Type>) => boolean | string
  defaultValues: ServiceDefaultValues<A, M>
}

export type ServiceDefaultValues<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> = {
  [key in M]: MethodDefaultValues<M>
}

export type MethodDefaultValues<T = string> = {
  [key: `arg${number}`]: FieldTypeFromIDLType<T>
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

export type DynamicFieldType<T extends FieldType> = T extends "record"
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
    : T extends IDL.TupleClass<IDL.Type[]>
    ? TupleFields<T>
    : T extends IDL.VariantClass
    ? VariantFields<T>
    : T extends IDL.VecClass<IDL.Type>
    ? VectorFields
    : T extends IDL.OptClass<IDL.Type>
    ? OptionalFields
    : T extends IDL.RecClass<IDL.Type>
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

export type FieldTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : IDL.Type

export type ExtraInputFormFields = Partial<{
  maxLength: number
  minLength: number
}>

export interface DefaultField extends ExtraInputFormFields {
  type: FieldType
  label: string
  validate: (value: FieldTypeFromIDLType<IDL.Type>) => boolean | string
  defaultValue?: FieldTypeFromIDLType<IDL.Type>
  defaultValues?:
    | FieldTypeFromIDLType<IDL.Type>[]
    | Record<string, FieldTypeFromIDLType<IDL.Type>>
}
