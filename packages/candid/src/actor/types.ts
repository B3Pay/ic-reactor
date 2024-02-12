import { ActorManagerOptions } from "@ic-reactor/store"

export interface ActorCandidManagerOptions extends ActorManagerOptions {}

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
  | "null"
