import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"

export type ReturnDetails<A = BaseActor> = {
  [K in FunctionName<A>]: MethodReturnDetails<A>
}

export type MethodReturnDetails<A = BaseActor> = {
  functionType: FunctionType
  functionName: FunctionName<A>
  __label: string
  __description?: string
  details: { [key: `ret${number}`]: ReturnDetailsWithChild }
}

export interface ReturnFieldDetails {
  __label: string
  __description?: string
  [key: string]: string | boolean | undefined
}

export interface OutputDetails extends ReturnFieldDetails {
  __checked?: boolean
  [key: string]: string | boolean | undefined
}

export type OtherOutputDetails =
  | ReturnFieldDetails
  | ReturnDetailsWithChild
  | ReturnDetailsWithChild[]
  | ReturnFieldDetails[]

export interface ReturnDetailsWithChild {
  __hidden?: boolean
  __checked?: boolean
  __label: string
  __description?: string
  optional?: OtherOutputDetails
  vector?: OtherOutputDetails
  [key: string]: string | boolean | undefined | OtherOutputDetails
}
