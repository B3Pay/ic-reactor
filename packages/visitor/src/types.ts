import { IDL } from "@ic-reactor/core/dist/types"

export * from "./transform/types"
export * from "./layouts/types"
export * from "./fields/types"
export * from "./details/types"

export type FieldType =
  | "record"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "list"
  | "blob"
  | "recursive"
  | "unknown"
  | "text"
  | "number"
  | "principal"
  | "boolean"
  | "null"

export type AllNumberTypes =
  | IDL.NatClass
  | IDL.IntClass
  | IDL.NatClass
  | IDL.FixedNatClass
  | IDL.FixedIntClass
  | IDL.FloatClass
