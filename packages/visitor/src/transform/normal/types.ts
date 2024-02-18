import type {
  DefaultActorType,
  ActorMethodReturnType,
  FunctionName,
  Principal,
} from "@ic-reactor/store"
import { ReturnDataType } from "../types"

export interface DynamicDataArgs<V = unknown> {
  label: string
  value: V
}

export interface ResultArrayData<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  label: string
  value: ActorMethodReturnType<A[M]>[]
}

export interface ResultRecordData<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  label: string
  value: Record<string, ActorMethodReturnType<A[M]>>
}

export type MethodResultValue<
  A = DefaultActorType,
  M extends FunctionName<A> = FunctionName<A>
> =
  | ActorMethodReturnType<A[M]>
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
  description: string
}
