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

// ════════════════════════════════════════════════════════════════════════════
// Shared Types for Visitors (Arguments & Returns)
// ════════════════════════════════════════════════════════════════════════════

/**
 * The core Candid type category used across visitors.
 */
export type VisitorDataType =
  | "record"
  | "funcRecord"
  | "variant"
  | "tuple"
  | "optional"
  | "vector"
  | "blob"
  | "recursive"
  | "principal"
  | "number"
  | "text"
  | "boolean"
  | "null"
  | "func"
  | "unknown"

/**
 * Detected format for text fields based on label heuristics.
 * Used to provide format-specific validation and display.
 */
export type TextFormat =
  | "plain"
  | "timestamp"
  | "uuid"
  | "url"
  | "email"
  | "phone"
  | "btc"
  | "eth"
  | "account-id"
  | "principal"
  | "cycle"

/**
 * Detected format for number fields based on label heuristics.
 * Used to provide format-specific validation and display.
 */
export type NumberFormat = "timestamp" | "cycle" | "value" | "token" | "normal"
