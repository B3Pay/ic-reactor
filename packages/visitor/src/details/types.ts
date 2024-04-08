import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"

export type FunctionCategory = "home" | "wallet" | "governance" | "setting"

export type ServiceDetails<A = BaseActor> = {
  [K in FunctionName<A>]: MethodDetails<A>
}

export type MethodDetails<A = BaseActor> = {
  functionType: FunctionType
  functionName: FunctionName<A>
  __label: string
  __description?: string
  args: { [key: `arg${number}`]: FieldDetailsWithChild }
  rets: { [key: `ret${number}`]: FieldDetailsWithChild }
}

export interface FieldDetails {
  __label: string
  __description?: string
  [key: string]: string | boolean | undefined
}

export interface InputDetails extends FieldDetails {
  __checked?: boolean
  [key: string]: string | boolean | undefined
}

export type OtherDetails =
  | FieldDetails
  | FieldDetailsWithChild
  | FieldDetailsWithChild[]
  | FieldDetails[]

export interface FieldDetailsWithChild {
  __hidden?: boolean
  __checked?: boolean
  __label: string
  __description?: string
  optional?: OtherDetails
  vector?: OtherDetails
  [key: string]: string | boolean | undefined | OtherDetails
}
