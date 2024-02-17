import type {
  DefaultActorType,
  ExtractActorMethodReturnType,
  FunctionName,
  IDL,
  Principal,
} from "@ic-reactor/store"

export type ReturnDataType =
  | "record"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "recursive"
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

export interface ExtractedServiceResults<A = DefaultActorType> {
  canisterId: string
  methodResult: ServiceResult<A>
}

export type ServiceResult<A = DefaultActorType> = {
  [K in FunctionName<A>]: <
    ExtractorClass extends IDL.Visitor<unknown, unknown>
  >(
    data: ResultArrayData<A>,
    extractorClass?: ExtractorClass
  ) => MethodResult<A>
}

export interface DynamicDataArgs<V = unknown> {
  label: string
  value: V
}

export interface ResultArrayData<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  label: string
  value: ExtractActorMethodReturnType<A[M]>[]
}

export interface ResultRecordData<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  label: string
  value: Record<string, ExtractActorMethodReturnType<A[M]>>
}

export type MethodResultValue<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> =
  | ExtractActorMethodReturnType<A[M]>
  | MethodResult<A, M>
  | number
  | string
  | boolean
  | Principal
  | Uint8Array
  | null

export type MethodResult<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> = {
  type: ReturnDataType
  label: string
  value?: MethodResultValue<A, M>
  values?: MethodResult<A, M>[]
  description: string[] | string
}
