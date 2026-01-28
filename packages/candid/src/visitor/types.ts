export type FieldType =
  | "functionRecord"
  | "function"
  | "record"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "table"
  | "blob"
  | "blob-large"
  | "recursive"
  | "unknown"
  | "text"
  | "number"
  | "principal"
  | "boolean"
  | "null"

export type { Principal } from "@icp-sdk/core/principal"

import type { IDL } from "@icp-sdk/core/candid"
export type AllNumberTypes =
  | IDL.NatClass
  | IDL.IntClass
  | IDL.FixedNatClass
  | IDL.FixedIntClass
  | IDL.FloatClass
