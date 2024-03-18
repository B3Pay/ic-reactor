import type { Principal } from "@ic-reactor/core/dist/types"

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
  | "normal"
  | "table"

export interface DynamicDataArgs<V = unknown> {
  label?: string
  value: V
}

export type DefaultMethodResult = {
  type: ReturnDataType
  label: string
}

export type MethodResult<T extends ReturnDataType = ReturnDataType> =
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
    : T extends "unknown"
    ? UnknownMethodResult
    : never

export interface NormalMethodResult {
  type: "normal"
  label: string
  values: Record<`ret${number}`, MethodResult<ReturnDataType>>
}

export interface RecordMethodResult extends DefaultMethodResult {
  type: "record"
  values: Record<string, MethodResult<ReturnDataType>>
}

export interface TupleMethodResult extends DefaultMethodResult {
  type: "tuple"
  values: Array<MethodResult<ReturnDataType>>
}

export interface OptionalMethodResult extends DefaultMethodResult {
  type: "optional"
  value: MethodResult<ReturnDataType> | null
}

export type VectorMethodResult = DefaultMethodResult & {
  type: "vector"
} & (
    | {
        componentType: "blob"
        value: ArrayBuffer
      }
    | {
        componentType: "normal"
        values: Array<MethodResult<ReturnDataType>>
      }
  )

export type NumberMethodResult = DefaultMethodResult &
  (
    | {
        type: "number"
        componentType: "timestamp" | "cycle" | "bigInt" | "value"
        value: bigint
      }
    | {
        type: "number"
        componentType: "normal"
        value: number
      }
  )

export interface TextMethodResult extends DefaultMethodResult {
  type: "text"
  componentType: "url" | "image" | "null" | "normal"
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

export interface UnknownMethodResult extends DefaultMethodResult {
  type: "unknown"
  value: unknown
}
