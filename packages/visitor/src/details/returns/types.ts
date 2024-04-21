import type { BaseActor, FunctionName, FunctionType } from "../../types"

export enum Status {
  Visible = 0, // Default
  Hidden = 1,
  Table = 2,
  Grid = 3,
  Card = 4,
  List = 5,
}

export type ReturnDetailsParams<A = BaseActor, M = FunctionName<A>> = {
  __label: M
  __status: Status
}

export type ReturnDetails<A = BaseActor> = {
  [K in FunctionName<A>]: MethodReturnDetails<A>
}

export type MethodReturnDetails<A = BaseActor> = {
  functionType: FunctionType
  functionName: FunctionName<A>
  __label: string
  __status: Status
  __description?: string
  details: { [key: `ret${number}`]: ReturnDetailsWithChild }
}

export interface ReturnFieldDetails {
  __label: string
  __status: Status
  __description?: string
  [key: string]: Status | string | boolean | undefined
}

export interface OutputDetails extends ReturnFieldDetails {
  __checked?: boolean
  __status: Status
  [key: string]: Status | string | boolean | undefined
}

export type OtherOutputDetails =
  | ReturnFieldDetails
  | ReturnDetailsWithChild
  | ReturnDetailsWithChild[]
  | ReturnFieldDetails[]

export interface ReturnDetailsWithChild {
  __label: string
  __status: Status
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
