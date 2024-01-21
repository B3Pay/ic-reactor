import { IDL } from "@dfinity/candid"

export type ExtractedFieldType =
  | "record"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "recursive"
  | "unknown"
  | "text"
  | "number"
  | "principal"
  | "boolean"
  | "null"

export type ExtractTypeFromIDLType<T = any> = T extends IDL.Type
  ? ReturnType<T["decodeValue"]>
  : any

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
  type: ExtractedFieldType
}

export interface FieldDetailsWithChild {
  label: string
  type: ExtractedFieldType
  description: string
  fields:
    | FieldDetails
    | FieldDetailsWithChild
    | Record<string, FieldDetailsWithChild | FieldDetails>
    | FieldDetailsWithChild[]
    | FieldDetails[]
}

export type FunctionType = "query" | "update"

export type FunctionDetails<A> = {
  order: number
  type: FunctionType
  functionName: keyof A
  label: string
  description: string
  fields: FieldDetailsWithChild[] | FieldDetails[]
  [key: `arg${number}`]: FieldDetailsWithChild
}
