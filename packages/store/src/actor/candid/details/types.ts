import { FieldType, FunctionType } from "../types"

export interface ExtractedServiceDetails<A> {
  canisterId: string
  description: string
  methodDetails: ServiceDetails<A>
}

export type ServiceDetails<A> = {
  [K in keyof A]: MethodDetails<A>
}

export type MethodDetails<A> = {
  functionType: FunctionType
  functionName: keyof A
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

export interface FieldDetailsWithChild extends FieldDetails {
  [key: string]:
    | string
    | FieldDetails
    | FieldDetailsWithChild
    | FieldDetailsWithChild[]
    | FieldDetails[]
}
