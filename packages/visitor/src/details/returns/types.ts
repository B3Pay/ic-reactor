import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"

export enum Status {
  Default = 0, // Default
  Hidden = 1,
  Disabled = 2,
}

export type ReturnDetailsParams<A = BaseActor, M = FunctionName<A>> = {
  __label: M
  __status?: Status
}

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
  __status?: Status
  __description?: string
  [key: string]: Status | string | boolean | undefined
}

export interface OutputDetails extends ReturnFieldDetails {
  __checked?: boolean
  __status?: Status
  [key: string]: Status | string | boolean | undefined
}

export type OtherOutputDetails =
  | ReturnFieldDetails
  | ReturnDetailsWithChild
  | ReturnDetailsWithChild[]
  | ReturnFieldDetails[]

export interface ReturnDetailsWithChild {
  __label: string
  __hidden?: boolean
  __status?: Status
  __description?: string
  optional?: OtherOutputDetails
  vector?: OtherOutputDetails
  list?: OtherOutputDetails
  labelList?: string[]
  [key: string]:
    | string[]
    | string
    | boolean
    | Status
    | undefined
    | OtherOutputDetails
}
