import type {
  BaseActor,
  FunctionName,
  FunctionType,
  IDL,
  AllNumberTypes,
  FieldType,
} from "../../types"

export type ServiceArgs<A = BaseActor> = {
  [K in FunctionName<A>]: MethodArgs<A>
}

export interface MethodArgs<A = BaseActor> {
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

export interface RecordArgs<T extends IDL.Type> extends DefaultArg {
  type: "record"
  fields: AllArgTypes<T>[]
  defaultValues: Record<string, ArgTypeFromIDLType<T>>
}

export interface VariantArgs<T extends IDL.Type> extends DefaultArg {
  type: "variant"
  options: string[]
  defaultValue: string
  fields: AllArgTypes<T>[]
  defaultValues: ArgTypeFromIDLType<T>
}

export interface TupleArgs<T extends IDL.Type> extends DefaultArg {
  type: "tuple"
  fields: AllArgTypes<T>[]
  defaultValues: ArgTypeFromIDLType<T>[]
}

export interface OptionalArgs extends DefaultArg {
  type: "optional"
  field: AllArgTypes<IDL.Type>
  defaultValue: []
}

export interface VectorArgs extends DefaultArg {
  type: "vector"
  field: AllArgTypes<IDL.Type>
  defaultValue: []
}

export interface BlobArgs extends DefaultArg {
  type: "blob"
  field: AllArgTypes<IDL.Type>
  defaultValue: []
}

export interface RecursiveArgs extends DefaultArg {
  type: "recursive"
  name: string
  extract: () => VariantArgs<IDL.Type>
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
  ? RecordArgs<IDL.Type>
  : T extends "variant"
  ? VariantArgs<IDL.Type>
  : T extends "tuple"
  ? TupleArgs<IDL.Type>
  : T extends "optional"
  ? OptionalArgs
  : T extends "vector"
  ? VectorArgs
  : T extends "blob"
  ? BlobArgs
  : T extends "recursive"
  ? RecursiveArgs
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
    ? RecordArgs<T>
    : T extends IDL.TupleClass<IDL.Type[]>
    ? TupleArgs<T>
    : T extends IDL.VariantClass
    ? VariantArgs<T>
    : T extends IDL.VecClass<IDL.Type>
    ? VectorArgs
    : T extends IDL.OptClass<IDL.Type>
    ? OptionalArgs
    : T extends IDL.RecClass<IDL.Type>
    ? RecursiveArgs
    : T extends IDL.PrincipalClass
    ? PrincipalArg
    : T extends AllNumberTypes
    ? NumberArg
    : InputArg<T>

export type AllArgTypes<T extends IDL.Type> =
  | RecordArgs<T>
  | TupleArgs<T>
  | VariantArgs<T>
  | VectorArgs
  | OptionalArgs
  | RecursiveArgs
  | PrincipalArg
  | NumberArg
  | InputArg<T>

export type ArgTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : IDL.Type

export type ExtraInputFormArgs = Partial<{
  maxLength: number
  minLength: number
}>

export interface DefaultArg extends ExtraInputFormArgs {
  type: FieldType
  label: string
  validate: (value: ArgTypeFromIDLType<IDL.Type>) => boolean | string
  defaultValue?: ArgTypeFromIDLType<IDL.Type>
  defaultValues?:
    | ArgTypeFromIDLType<IDL.Type>[]
    | Record<string, ArgTypeFromIDLType<IDL.Type>>
}
