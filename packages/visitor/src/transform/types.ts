import type { Principal } from "../types"

export type ReturnDataType =
  | "record"
  | "variant"
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
  label?: string
  title?: string
}

export type MethodResult<T extends ReturnDataType = ReturnDataType> =
  T extends "normal"
    ? NormalMethodResult
    : T extends "record"
    ? RecordMethodResult
    : T extends "variant"
    ? VariantMethodResult
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
  label?: string
  title?: string
  values: Record<`ret${number}`, MethodResult<ReturnDataType>>
}

export interface VariantMethodResult
  extends Omit<DefaultMethodResult, "label"> {
  type: "variant"
  variant: string
  label?: string
}

export type RecordMethodResult = DefaultMethodResult & {
  type: "record"
  values: Array<MethodResult<ReturnDataType>>
}

export type TupleMethodResult =
  | DefaultMethodResult &
      (
        | {
            type: "tuple"
            componentType: "normal"
            values: Array<MethodResult<ReturnDataType>>
          }
        | {
            type: "tuple"
            componentType: "record"
            key: MethodResult<ReturnDataType>
            value: MethodResult<ReturnDataType>
          }
        | {
            type: "tuple"
            componentType: "title"
            value: MethodResult<ReturnDataType>
          }
        | {
            type: "tuple"
            componentType: "keyValue"
            key: MethodResult<ReturnDataType>
            value: MethodResult<ReturnDataType>
          }
      )

export interface OptionalMethodResult extends DefaultMethodResult {
  type: "optional"
  value: MethodResult<ReturnDataType> | null
}

export type VectorMethodResult = DefaultMethodResult & {
  type: "vector"
} & (
    | {
        componentType: "blob"
        value: Uint8Array
      }
    | {
        componentType: "normal"
        values: Array<MethodResult<ReturnDataType>>
      }
    | {
        componentType: "table"
        tableList: string[]
        values: Array<RecordMethodResult>
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
