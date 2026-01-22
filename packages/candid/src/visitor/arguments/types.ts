import type { BaseActor, FunctionName, FunctionType } from "@ic-reactor/core"
import type { IDL, AllNumberTypes, FieldType } from "../types"
// Fallback local types for moved/removed modules (keeps backwards compatibility)
// The real implementations were refactored; these types are intentionally permissive.
type MethodResult = unknown
export type ArgTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : unknown
export type MethodArgsDefaultValues<T = string> = Record<string, T> | T[]
export interface ExtraInputFormArg {
  transform?: (value: unknown) => unknown
}
import type { ResultField } from "../returns/types"

export type TanstackServiceField<A = BaseActor> = {
  [K in FunctionName<A>]: TanstackMethodField<A>
}

export interface TanstackMethodField<A = BaseActor> {
  functionName: FunctionName<A>
  functionType: FunctionType
  /** Input argument fields for form rendering */
  fields: TanstackAllArgTypes<IDL.Type>[] | []
  /** Default values for the form */
  defaultValues: MethodArgsDefaultValues<FunctionName<A>>
  /** Result fields for display rendering (lean, UI-focused) */
  generateField: (data: unknown) => ResultField[]
}

export type TanstackFieldProps = {
  name: string
  mode?: "value" | "array"
}

export interface TanstackDefaultArg extends ExtraInputFormArg {
  type: FieldType
  label: string
  name: string
  fieldProps: TanstackFieldProps
  defaultValue?: ArgTypeFromIDLType<IDL.Type>
  defaultValues?:
    | ArgTypeFromIDLType<IDL.Type>[]
    | Record<string, ArgTypeFromIDLType<IDL.Type>>
  transform?: (value: unknown) => MethodResult
}

export interface TanstackRecordArg<
  T extends IDL.Type,
> extends TanstackDefaultArg {
  type: "record"
  fields: TanstackAllArgTypes<T>[]
  defaultValues: Record<string, ArgTypeFromIDLType<T>>
}

export interface TanstackVariantArg<
  T extends IDL.Type,
> extends TanstackDefaultArg {
  type: "variant"
  options: string[]
  defaultValue: string
  fields: TanstackAllArgTypes<T>[]
  defaultValues: ArgTypeFromIDLType<T>
}

export interface TanstackTupleArg<
  T extends IDL.Type,
> extends TanstackDefaultArg {
  type: "tuple"
  fields: TanstackAllArgTypes<T>[]
  defaultValues: ArgTypeFromIDLType<T>[]
}

export interface TanstackOptionalArg extends TanstackDefaultArg {
  type: "optional"
  field: TanstackAllArgTypes<IDL.Type>
  defaultValue: null
}

export interface TanstackVectorArg extends TanstackDefaultArg {
  type: "vector"
  field: TanstackAllArgTypes<IDL.Type>
  defaultValue: []
}

export interface TanstackBlobArg extends TanstackDefaultArg {
  type: "blob"
  field: TanstackAllArgTypes<IDL.Type>
  defaultValue: string
}

export interface TanstackRecursiveArg extends TanstackDefaultArg {
  type: "recursive"
  name: string
  extract: () => TanstackVariantArg<IDL.Type>
}

export interface TanstackPrincipalArg extends TanstackDefaultArg {
  type: "principal"
  required: true
  maxLength: number
  minLength: number
  defaultValue: string
}

export interface TanstackNumberArg extends TanstackDefaultArg {
  type: "number"
  min?: number | string
  max?: number | string
  required: true
  defaultValue: string
}

export interface TanstackBooleanArg extends TanstackDefaultArg {
  type: "boolean"
  required: true
  defaultValue: boolean
}

export interface TanstackNullArg extends TanstackDefaultArg {
  type: "null"
  required: true
  defaultValue: null
}

export interface TanstackInputArg<
  T extends IDL.Type,
> extends TanstackDefaultArg {
  required?: true
  defaultValue: ArgTypeFromIDLType<T>
}

export type TanstackDynamicArgType<T extends FieldType> = T extends "record"
  ? TanstackRecordArg<IDL.Type>
  : T extends "variant"
    ? TanstackVariantArg<IDL.Type>
    : T extends "tuple"
      ? TanstackTupleArg<IDL.Type>
      : T extends "optional"
        ? TanstackOptionalArg
        : T extends "vector"
          ? TanstackVectorArg
          : T extends "blob"
            ? TanstackBlobArg
            : T extends "recursive"
              ? TanstackRecursiveArg
              : T extends "unknown"
                ? TanstackInputArg<IDL.Type>
                : T extends "text"
                  ? TanstackInputArg<IDL.TextClass>
                  : T extends "number"
                    ? TanstackNumberArg
                    : T extends "principal"
                      ? TanstackPrincipalArg
                      : T extends "boolean"
                        ? TanstackInputArg<IDL.BoolClass>
                        : T extends "null"
                          ? TanstackInputArg<IDL.NullClass>
                          : never

export type TanstackDynamicArgTypeByClass<T extends IDL.Type> =
  T extends IDL.RecordClass
    ? TanstackRecordArg<T>
    : T extends IDL.TupleClass<IDL.Type[]>
      ? TanstackTupleArg<T>
      : T extends IDL.VariantClass
        ? TanstackVariantArg<T>
        : T extends IDL.VecClass<IDL.Type>
          ? TanstackVectorArg
          : T extends IDL.OptClass<IDL.Type>
            ? TanstackOptionalArg
            : T extends IDL.RecClass<IDL.Type>
              ? TanstackRecursiveArg
              : T extends IDL.PrincipalClass
                ? TanstackPrincipalArg
                : T extends AllNumberTypes
                  ? TanstackNumberArg
                  : TanstackInputArg<T>

export type TanstackAllArgTypes<T extends IDL.Type> =
  | TanstackRecordArg<T>
  | TanstackTupleArg<T>
  | TanstackVariantArg<T>
  | TanstackVectorArg
  | TanstackOptionalArg
  | TanstackBlobArg
  | TanstackRecursiveArg
  | TanstackPrincipalArg
  | TanstackNumberArg
  | TanstackBooleanArg
  | TanstackNullArg
  | TanstackInputArg<T>

export type TanstackArgTypeFromIDLType<T> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : IDL.Type
