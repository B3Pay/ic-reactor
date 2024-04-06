import type { IDL } from "@dfinity/candid"
import type {
  BaseActor,
  FunctionName,
  FunctionType,
  Principal,
} from "@ic-reactor/core/dist/types"
import type { FieldType } from "../types"

export type ServiceFields<A = BaseActor> = {
  [K in FunctionName<A>]: MethodFields<A>
}

export interface MethodFields<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  fields: AllFieldTypes<IDL.Type>[] | []
  defaultValues: ServiceDefaultValues<A>
}

export type ServiceDefaultValues<A = BaseActor> = {
  [K in FunctionName<A>]: MethodDefaultValues<K>
}

export type MethodDefaultValues<T = string> = {
  [key: `ret${number}`]: FieldTypeFromIDLType<T>
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

export interface BlobFields extends DefaultField {
  type: "blob"
  defaultValue: [0, 1, 2, 3, 4, 5]
}

export interface RecursiveFields extends DefaultField {
  type: "recursive"
  name: string
  extract: () => VariantFields<IDL.Type>
}

export interface PrincipalField extends DefaultField {
  type: "principal"
  defaultValue: Principal
}

export interface NumberField extends DefaultField {
  type: "number"
  defaultValue: number
}

export interface InputField<T extends IDL.Type> extends DefaultField {
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
  : T extends "blob"
  ? BlobFields
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

export interface DefaultField {
  type: FieldType
  label: string
  defaultValue?: FieldTypeFromIDLType<IDL.Type>
  defaultValues?:
    | FieldTypeFromIDLType<IDL.Type>[]
    | Record<string, FieldTypeFromIDLType<IDL.Type>>
}
