import { DefaultActorType } from "../../types"
import { FieldType, FunctionName, FunctionType } from "../types"

export type FunctionCategory = "home" | "wallet" | "governance" | "setting"

export interface ExtractedServiceDetails<A = DefaultActorType> {
  canisterId: string
  description: string
  methodDetails: ServiceDetails<A>
}

export type ServiceDetails<A = DefaultActorType> = {
  [K in FunctionName<A>]: MethodDetails<A>
}

export type MethodDetails<A = DefaultActorType> = {
  functionType: FunctionType
  functionName: FunctionName<A>
  category: FunctionCategory
  order: number
  __label: string
  __description: string
  [key: `arg${number}`]: FieldDetailsWithChild
}

export interface FieldDetails {
  __label: string
  __type: FieldType
  __description: string
}

export interface InputDetails extends FieldDetails {
  __checked?: boolean
  [key: string]: string | boolean | undefined
}

export interface FieldDetailsWithChild extends FieldDetails {
  __hidden?: boolean
  __checked?: boolean
  [key: string]:
    | string
    | FieldDetails
    | FieldDetailsWithChild
    | FieldDetailsWithChild[]
    | FieldDetails[]
    | boolean
    | undefined
}
