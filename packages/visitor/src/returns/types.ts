import { IDL } from "@dfinity/candid"
import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"
import { FieldType } from "../types"

export type ServiceFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export interface MethodFields<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  fields: AllFieldTypes<IDL.Type>[] | []
}

export type ServiceDefaultValues<A = BaseActor> = {
  [K in FunctionName<A>]: MethodDefaultValues<K>
}

export type MethodDefaultValues<T = string> = {
  [key: `arg${number}`]: FieldTypeFromIDLType<T>
}

export interface RecordFields<T extends IDL.Type> extends DefaultField {
  type: "record"
  fields: AllFieldTypes<T>[]
}

export interface VariantFields<T extends IDL.Type> extends DefaultField {
  type: "variant"
  options: string[]
  fields: AllFieldTypes<T>[]
}

export interface TupleFields<T extends IDL.Type> extends DefaultField {
  type: "tuple"
  fields: AllFieldTypes<T>[]
}

export interface OptionalFields extends DefaultField {
  type: "optional"
  field: AllFieldTypes<IDL.Type>
}

export interface VectorFields extends DefaultField {
  type: "vector"
  field: AllFieldTypes<IDL.Type>
}

export interface BlobFields extends DefaultField {
  type: "blob"
  field: AllFieldTypes<IDL.Type>
}

export interface RecursiveFields extends DefaultField {
  type: "recursive"
  name: string
  extract: () => VariantFields<IDL.Type>
}

export interface PrincipalField extends DefaultField {
  type: "principal"
}

export interface NumberField extends DefaultField {
  type: "number"
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
  : T extends "blob"
  ? BlobFields
  : T extends "recursive"
  ? RecursiveFields
  : T extends "unknown"
  ? DefaultField
  : T extends "text"
  ? DefaultField
  : T extends "number"
  ? NumberField
  : T extends "principal"
  ? PrincipalField
  : T extends "boolean"
  ? DefaultField
  : T extends "null"
  ? DefaultField
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
    : DefaultField

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
  | DefaultField

export type FieldTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : IDL.Type

export interface DefaultField {
  type: FieldType
  label: string
}
