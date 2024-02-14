import {
  DefaultActorType,
  FunctionName,
  FunctionType,
  IDL,
} from "@ic-reactor/store"
import { FieldType } from "../types"

export type FunctionCategory = "home" | "wallet" | "governance" | "setting"

export interface ExtractedServiceDetails<A = DefaultActorType> {
  canisterId: string
  description: string
  methodDetails: ServiceDetails<A>
}

export type ServiceDetails<A = DefaultActorType> = {
  [K in FunctionName<A>]: <ExtractorClass extends IDL.Visitor<any, any>>(
    extractorClass?: ExtractorClass
  ) => MethodDetails<A>
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
  optional?: OtherDetails
  vector?: OtherDetails
  [key: string]: string | boolean | undefined | OtherDetails
}
