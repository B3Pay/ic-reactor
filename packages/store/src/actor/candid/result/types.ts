import type {
  DefaultActorType,
  ExtractActorMethodReturnType,
  IDL,
} from "../../types"
import type { FieldType, FunctionName } from "../types"

export interface ExtractedServiceResults<A = DefaultActorType> {
  canisterId: string
  methodResult: { [key in FunctionName<A>]: IDL.Type[] }
}

export interface ResultUnknownData {
  label: string
  value: any
}

export interface ResultData<A, M extends FunctionName<A> = FunctionName<A>> {
  label: string
  value: ExtractActorMethodReturnType<A[M]>
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

export type MethodResult<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> = {
  type: FieldType
  label: string
  value?:
    | ExtractActorMethodReturnType<A[M]>
    | MethodResult<A>
    | string
    | Uint8Array
    | null
  values?: MethodResult<A>[]
  description: string
}
