import { DefaultActorType } from "../types"

export type FunctionName<A = DefaultActorType> = keyof A & string

export type FunctionType = "query" | "update"

export type FieldType =
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
  | "blob"
  | "null"
