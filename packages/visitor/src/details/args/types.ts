import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"

export type ArgDetails<A = BaseActor> = {
  [K in FunctionName<A>]: MethodArgDetails<A>
}

export type MethodArgDetails<A = BaseActor> = {
  functionType: FunctionType
  functionName: FunctionName<A>
  __label: string
  __description?: string
  details: { [key: `arg${number}`]: ArgDetailsWithChild }
}

export interface ArgFieldDetails {
  __label: string
  __description?: string
  [key: string]: string | boolean | undefined
}

export interface InputDetails extends ArgFieldDetails {
  __checked?: boolean
  [key: string]: string | boolean | undefined
}

export type OtherInputDetails =
  | ArgFieldDetails
  | ArgDetailsWithChild
  | ArgDetailsWithChild[]
  | ArgFieldDetails[]

export interface ArgDetailsWithChild {
  __hidden?: boolean
  __checked?: boolean
  __label: string
  __description?: string
  optional?: OtherInputDetails
  vector?: OtherInputDetails
  [key: string]: string | boolean | undefined | OtherInputDetails
}