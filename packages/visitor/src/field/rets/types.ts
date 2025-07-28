import type {
  IDL,
  AllNumberTypes,
  FieldType,
  BaseActor,
  FunctionName,
  FunctionType,
  Principal,
  ArgTypeFromIDLType,
} from "../../types"

export type ServiceReturn<A = BaseActor> = {
  [K in FunctionName<A>]: MethodReturn<A>
}

export type MethodReturn<A = BaseActor> =
  | FunctionMethodReturn
  | NormalMethodReturn<A>

export type FunctionMethodReturn = {
  type: "function"
  label: string
  functionClass: IDL.FuncClass
}

export type NormalMethodReturn<A = BaseActor> = {
  type: "normal"
  functionName: FunctionName<A>
  functionType: FunctionType
  fields: AllReturnTypes<IDL.Type>[] | []
  defaultValues: MethodRetsDefaultValues<FunctionName<A>>
  transformData: (data: unknown) => MethodRetsDefaultValues<FunctionName<A>>
}

export type MethodRetsDefaultValues<T = string> = {
  [key: `ret${number}`]: ReturnTypeFromIDLType<T>
}

export interface RecordReturn<T extends IDL.Type> extends DefaultReturn {
  type: "record"
  fields: AllReturnTypes<T>[]
}

export interface FunctionRecordReturn<T extends IDL.Type>
  extends DefaultReturn {
  type: "functionRecord"
  extract: (values: Record<string, unknown>) => FunctionExtractedData<T>
}

export type FunctionExtractedData<T extends IDL.Type = IDL.Type> = {
  canisterId: Principal
  functionName: string
  idlFactory: IDL.InterfaceFactory
  args: [Record<string, ArgTypeFromIDLType<T>>]
}

export interface VariantReturn<T extends IDL.Type> extends DefaultReturn {
  type: "variant"
  options: string[]
  selected: string
  fields: AllReturnTypes<T>[]
}

export interface TupleReturn<T extends IDL.Type> extends DefaultReturn {
  type: "tuple"
  fields: AllReturnTypes<T>[]
}

export interface OptionalReturn extends DefaultReturn {
  type: "optional"
  field: AllReturnTypes<IDL.Type>
}

export interface VectorReturn extends DefaultReturn {
  type: "vector"
  field: AllReturnTypes<IDL.Type>
}

export interface ListReturn extends DefaultReturn {
  type: "table"
  tableList: string[]
  fields: AllReturnTypes<IDL.Type>[]
}

export interface BlobReturn extends DefaultReturn {
  type: "blob"
}

export interface RecursiveReturn extends DefaultReturn {
  type: "recursive"
  name: string
  extract: () => VariantReturn<IDL.Type>
}

export interface PrincipalReturn extends DefaultReturn {
  type: "principal"
}

export interface NumberReturn extends DefaultReturn {
  type: "number"
  componentType: "timestamp" | "cycle" | "value" | "normal"
}

export type InputReturn = DefaultReturn

export type DynamicReturnType<T extends FieldType> = T extends "function"
  ? FunctionMethodReturn
  : T extends "functionRecord"
  ? FunctionRecordReturn<IDL.Type>
  : T extends "record"
  ? RecordReturn<IDL.Type>
  : T extends "variant"
  ? VariantReturn<IDL.Type>
  : T extends "tuple"
  ? TupleReturn<IDL.Type>
  : T extends "optional"
  ? OptionalReturn
  : T extends "vector"
  ? VectorReturn
  : T extends "table"
  ? ListReturn
  : T extends "blob"
  ? BlobReturn
  : T extends "recursive"
  ? RecursiveReturn
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
    ? RecordReturn<T>
    : T extends IDL.TupleClass<IDL.Type[]>
    ? TupleReturn<T>
    : T extends IDL.VariantClass
    ? VariantReturn<T>
    : T extends IDL.VecClass<IDL.Type>
    ? VectorReturn
    : T extends IDL.OptClass<IDL.Type>
    ? OptionalReturn
    : T extends IDL.RecClass<IDL.Type>
    ? RecursiveReturn
    : T extends IDL.PrincipalClass
    ? PrincipalReturn
    : T extends AllNumberTypes
    ? NumberReturn
    : InputReturn

export type AllReturnTypes<T extends IDL.Type> =
  | RecordReturn<T>
  | TupleReturn<T>
  | VariantReturn<T>
  | VectorReturn
  | OptionalReturn
  | RecursiveReturn
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
