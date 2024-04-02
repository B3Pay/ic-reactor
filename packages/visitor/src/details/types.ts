import type {
  BaseActor,
  FunctionName,
  FunctionType,
} from "@ic-reactor/core/dist/types"
import type { FieldType } from "../types"

export type FunctionCategory = "home" | "wallet" | "governance" | "setting"

export type ServiceDetails<A = BaseActor> = {
  [K in FunctionName<A>]: MethodDetails<A>
}

export type MethodDetails<A = BaseActor> = {
  functionType: FunctionType
  functionName: FunctionName<A>
  __label: string
  __description: string
  __show_description?: boolean
  [key: `arg${number}`]: FieldDetailsWithChild
}

export interface FieldDetails {
  __label: string
  __type: FieldType
  __description: string
  __show_description?: boolean
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
  __type: FieldType
  __description: string
  __show_description?: boolean
  optional?: OtherDetails
  vector?: OtherDetails
  [key: string]: string | boolean | undefined | OtherDetails
}
