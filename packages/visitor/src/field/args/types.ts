import type {
  BaseActor,
  FunctionName,
  FunctionType,
  IDL,
  AllNumberTypes,
  FieldType,
} from "../../types"

export type ServiceArg<A = BaseActor> = {
  [K in FunctionName<A>]: MethodArg<A>
}

export interface MethodArg<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  fields: AllArgTypes<IDL.Type>[] | []
  validateAndReturnArgs: (
    data: MethodArgsDefaultValues<FunctionName<A>>
  ) => ArgTypeFromIDLType<FunctionName<A>>[]
  defaultValues: MethodArgsDefaultValues<FunctionName<A>>
}

export type MethodArgsDefaultValues<T = string> = {
  [key: `arg${number}`]: ArgTypeFromIDLType<T>
}

export interface RecordArg<T extends IDL.Type> extends DefaultArg {
  type: "record"
  fields: AllArgTypes<T>[]
  defaultValues: Record<string, ArgTypeFromIDLType<T>>
}

export interface VariantArg<T extends IDL.Type> extends DefaultArg {
  type: "variant"
  options: string[]
  defaultValue: string
  fields: AllArgTypes<T>[]
  defaultValues: ArgTypeFromIDLType<T>
}

export interface TupleArg<T extends IDL.Type> extends DefaultArg {
  type: "tuple"
  fields: AllArgTypes<T>[]
  defaultValues: ArgTypeFromIDLType<T>[]
}

export interface OptionalArg extends DefaultArg {
  type: "optional"
  field: AllArgTypes<IDL.Type>
  defaultValue: []
}

export interface VectorArg extends DefaultArg {
  type: "vector"
  field: AllArgTypes<IDL.Type>
  defaultValue: []
}

export interface BlobArg extends DefaultArg {
  type: "blob"
  field: AllArgTypes<IDL.Type>
  defaultValue: []
}

export interface RecursiveArg extends DefaultArg {
  type: "recursive"
  name: string
  extract: () => VariantArg<IDL.Type>
}

export interface PrincipalArg extends DefaultArg {
  type: "principal"
  required: true
  maxLength: number
  minLength: number
  defaultValue: string
}

export interface NumberArg extends DefaultArg {
  type: "number"
  min?: number | string
  max?: number | string
  required: true
  defaultValue: string
}

export interface InputArg<T extends IDL.Type> extends DefaultArg {
  required: true
  defaultValue: ArgTypeFromIDLType<T>
}

export type DynamicArgType<T extends FieldType> = T extends "record"
  ? RecordArg<IDL.Type>
  : T extends "variant"
  ? VariantArg<IDL.Type>
  : T extends "tuple"
  ? TupleArg<IDL.Type>
  : T extends "optional"
  ? OptionalArg
  : T extends "vector"
  ? VectorArg
  : T extends "blob"
  ? BlobArg
  : T extends "recursive"
  ? RecursiveArg
  : T extends "unknown"
  ? InputArg<IDL.Type>
  : T extends "text"
  ? InputArg<IDL.TextClass>
  : T extends "number"
  ? NumberArg
  : T extends "principal"
  ? PrincipalArg
  : T extends "boolean"
  ? InputArg<IDL.BoolClass>
  : T extends "null"
  ? InputArg<IDL.NullClass>
  : never

export type DynamicArgTypeByClass<T extends IDL.Type> =
  T extends IDL.RecordClass
    ? RecordArg<T>
    : T extends IDL.TupleClass<IDL.Type[]>
    ? TupleArg<T>
    : T extends IDL.VariantClass
    ? VariantArg<T>
    : T extends IDL.VecClass<IDL.Type>
    ? VectorArg
    : T extends IDL.OptClass<IDL.Type>
    ? OptionalArg
    : T extends IDL.RecClass<IDL.Type>
    ? RecursiveArg
    : T extends IDL.PrincipalClass
    ? PrincipalArg
    : T extends AllNumberTypes
    ? NumberArg
    : InputArg<T>

export type AllArgTypes<T extends IDL.Type> =
  | RecordArg<T>
  | TupleArg<T>
  | VariantArg<T>
  | VectorArg
  | OptionalArg
  | RecursiveArg
  | PrincipalArg
  | NumberArg
  | InputArg<T>

export type ArgTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : IDL.Type

export type ExtraInputFormArg = Partial<{
  maxLength: number
  minLength: number
}>

export interface DefaultArg extends ExtraInputFormArg {
  type: FieldType
  label: string
  validate: (value: ArgTypeFromIDLType<IDL.Type>) => boolean | string
  defaultValue?: ArgTypeFromIDLType<IDL.Type>
  defaultValues?:
    | ArgTypeFromIDLType<IDL.Type>[]
    | Record<string, ArgTypeFromIDLType<IDL.Type>>
}
