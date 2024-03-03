import type {
  ActorMethodReturnType,
  FunctionName,
  Principal,
} from "@ic-reactor/core/dist/types"

export type ReturnDataType =
  | "record"
  | "tuple"
  | "optional"
  | "vector"
  | "unknown"
  | "text"
  | "number"
  | "principal"
  | "boolean"
  | "null"
  | "blob"
  | "url"
  | "image"
  | "normal"
  | "table"

export interface ArrayResultData<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  label: string
  value: ActorMethodReturnType<A[M]>[]
}

export interface RecordResultData<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  label: string
  value: Record<string, ActorMethodReturnType<A[M]>>
}

export interface DynamicDataArgs<V = unknown> {
  label: string
  value: V
}

export type DefaultMethodResult = {
  type: ReturnDataType
  label: string
  description: string[] | string
}

export type MethodResult<T extends ReturnDataType = "normal"> =
  T extends "normal"
    ? NormalMethodResult
    : T extends "record"
    ? RecordMethodResult
    : T extends "tuple"
    ? TupleMethodResult
    : T extends "optional"
    ? OptionalMethodResult
    : T extends "vector"
    ? VectorMethodResult
    : T extends "number"
    ? NumberMethodResult
    : T extends "text"
    ? TextMethodResult
    : T extends "boolean"
    ? BooleanMethodResult
    : T extends "principal"
    ? PrincipalMethodResult
    : T extends "null"
    ? NullMethodResult
    : T extends "blob"
    ? BlobMethodResult
    : T extends "unknown"
    ? UnknownMethodResult
    : never

export interface NormalMethodResult extends DefaultMethodResult {
  type: "normal"
  values: MethodResult<ReturnDataType>[]
}

export interface RecordMethodResult extends DefaultMethodResult {
  type: "record"
  values: Array<MethodResult<ReturnDataType>>
}

export interface TupleMethodResult extends DefaultMethodResult {
  type: "tuple"
  values: Array<MethodResult<ReturnDataType>>
}

export interface OptionalMethodResult extends DefaultMethodResult {
  type: "optional"
  value: MethodResult<ReturnDataType> | null
}

export type VectorMethodResult = DefaultMethodResult &
  (
    | {
        type: "blob"
        value: Uint8Array
      }
    | {
        type: "vector"
        values: Array<MethodResult<ReturnDataType>>
      }
  )

export interface NumberMethodResult extends DefaultMethodResult {
  type: "number"
  value: number
}

export interface TextMethodResult extends DefaultMethodResult {
  type: "text" | "url" | "image"
  value: string
}

export interface BooleanMethodResult extends DefaultMethodResult {
  type: "boolean"
  value: boolean
}

export interface PrincipalMethodResult extends DefaultMethodResult {
  type: "principal"
  value: Principal
}

export interface NullMethodResult extends DefaultMethodResult {
  type: "null"
  value: null
}

export interface BlobMethodResult extends DefaultMethodResult {
  type: "blob"
  value: Uint8Array
}

export interface UnknownMethodResult extends DefaultMethodResult {
  type: "unknown"
  value: unknown
}
