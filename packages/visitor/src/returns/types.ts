import type { IDL } from "@dfinity/candid"
import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"
import type { AllNumberTypes, FieldType } from "../types"

export type ServiceReturns<A = BaseActor> = {
  [K in FunctionName<A>]: MethodReturns<A>
}

export interface MethodReturns<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  fields: AllReturnTypes<IDL.Type>[] | []
  transformData: (data: unknown | unknown[]) => ReturnDefaultValues<A>
}

export type ReturnDefaultValues<A = BaseActor> = {
  [K in FunctionName<A>]: ReturnMethodDefaultValues<K>
}

export type ReturnMethodDefaultValues<T = string> = {
  [key: `ret${number}`]: ReturnTypeFromIDLType<T>
}

export interface RecordReturns<T extends IDL.Type> extends DefaultReturn {
  type: "record"
  fields: AllReturnTypes<T>[]
}

export interface VariantReturns<T extends IDL.Type> extends DefaultReturn {
  type: "variant"
  options: string[]
  selected: string
  fields: AllReturnTypes<T>[]
}

export interface TupleReturns<T extends IDL.Type> extends DefaultReturn {
  type: "tuple"
  fields: AllReturnTypes<T>[]
}

export interface OptionalReturns extends DefaultReturn {
  type: "optional"
  field: AllReturnTypes<IDL.Type>
}

export interface VectorReturns extends DefaultReturn {
  type: "vector"
  field: AllReturnTypes<IDL.Type>
}

export interface BlobReturns extends DefaultReturn {
  type: "blob"
}

export interface RecursiveReturns extends DefaultReturn {
  type: "recursive"
  name: string
  extract: () => VariantReturns<IDL.Type>
}

export interface PrincipalReturn extends DefaultReturn {
  type: "principal"
}

export interface NumberReturn extends DefaultReturn {
  type: "number"
}

export interface InputReturn extends DefaultReturn {}

export type DynamicReturnType<T extends FieldType> = T extends "record"
  ? RecordReturns<IDL.Type>
  : T extends "variant"
  ? VariantReturns<IDL.Type>
  : T extends "tuple"
  ? TupleReturns<IDL.Type>
  : T extends "optional"
  ? OptionalReturns
  : T extends "vector"
  ? VectorReturns
  : T extends "blob"
  ? BlobReturns
  : T extends "recursive"
  ? RecursiveReturns
  : T extends "unknown"
  ? InputReturn
  : T extends "text"
  ? InputReturn
  : T extends "number"
  ? NumberReturn
  : T extends "principal"
  ? PrincipalReturn
  : T extends "boolean"
  ? InputReturn
  : T extends "null"
  ? InputReturn
  : never

export type DynamicReturnTypeByClass<T extends IDL.Type> =
  T extends IDL.RecordClass
    ? RecordReturns<T>
    : T extends IDL.TupleClass<IDL.Type[]>
    ? TupleReturns<T>
    : T extends IDL.VariantClass
    ? VariantReturns<T>
    : T extends IDL.VecClass<IDL.Type>
    ? VectorReturns
    : T extends IDL.OptClass<IDL.Type>
    ? OptionalReturns
    : T extends IDL.RecClass<IDL.Type>
    ? RecursiveReturns
    : T extends IDL.PrincipalClass
    ? PrincipalReturn
    : T extends AllNumberTypes
    ? NumberReturn
    : InputReturn

export type AllReturnTypes<T extends IDL.Type> =
  | RecordReturns<T>
  | TupleReturns<T>
  | VariantReturns<T>
  | VectorReturns
  | OptionalReturns
  | RecursiveReturns
  | PrincipalReturn
  | NumberReturn
  | InputReturn

export type ReturnTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : IDL.Type

export interface DefaultReturn {
  type: FieldType
  label: string
}
