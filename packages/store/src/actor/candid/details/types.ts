import { FieldType, FunctionType } from "../types"

export interface ExtractedServiceDetails<A> {
  canisterId: string
  description: string
  methodDetails: ServiceFieldDetails<A>
}

export type ServiceFieldDetails<A> = {
  [K in keyof A]: FunctionDetails<A>
}

export interface FieldDetails {
  label: string
  description: string
  type: FieldType
}

export interface FieldDetailsWithChild {
  label: string
  type: FieldType
  description: string
  fields:
    | FieldDetails
    | FieldDetailsWithChild
    | Record<string, FieldDetailsWithChild | FieldDetails>
    | FieldDetailsWithChild[]
    | FieldDetails[]
}

export type FunctionDetails<A> = {
  order: number
  type: FunctionType
  functionName: keyof A
  label: string
  description: string
  fields: FieldDetailsWithChild[] | FieldDetails[]
  [key: `arg${number}`]: FieldDetailsWithChild
}
