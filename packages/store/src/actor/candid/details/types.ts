import { FieldType, FunctionType } from "../types"

export interface ExtractedServiceDetails<A> {
  canisterId: string
  description: string
  methodDetails: ServiceFieldDetails<A>
}

export type ServiceFieldDetails<A> = {
  [K in keyof A]: FunctionDetails<A>
}

export type FunctionDetails<A> = {
  functionType: FunctionType
  functionName: keyof A
  order: number
  __label: string
  __description: string
  [key: `arg${number}`]: FieldDetailsWithChild
}

export interface FieldDetailsWithChild {
  __label: string
  __type: FieldType
  __description: string
  [key: string]:
    | string
    | FieldDetails
    | FieldDetailsWithChild
    | FieldDetailsWithChild[]
    | FieldDetails[]
  [key: number]:
    | FieldDetails
    | FieldDetailsWithChild
    | FieldDetailsWithChild[]
    | FieldDetails[]
}

export interface FieldDetails {
  __label: string
  __description: string
  __type: FieldType
}
