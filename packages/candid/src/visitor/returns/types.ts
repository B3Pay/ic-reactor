import type {
  BaseActor,
  FunctionName,
  FunctionType,
  ActorMethodReturnType,
} from "@ic-reactor/core"
import type { IDL } from "@icp-sdk/core/candid"
import type { VisitorDataType, TextFormat, NumberFormat } from "../types"

export type { VisitorDataType, TextFormat, NumberFormat }

// ════════════════════════════════════════════════════════════════════════════
// Core Types & Formats
// ════════════════════════════════════════════════════════════════════════════

/**
 * The display type category after transformation.
 * Maps Candid types to JavaScript-friendly display types.
 */
export type DisplayType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "object"
  | "array"
  | "variant"
  | "variant-null"
  | "result"
  | "nullable"
  | "recursive"
  | "blob"
  | "func"
  | "func-record"
  | "unknown"

// ════════════════════════════════════════════════════════════════════════════
// Unified Result Node - Single Structure for Schema & Resolved Data
// ════════════════════════════════════════════════════════════════════════════

/**
 * Base properties shared by all result nodes.
 */
interface ResultNodeBase<T extends VisitorDataType = VisitorDataType> {
  /** The Candid type category */
  type: T
  /** Raw label from Candid definition */
  label: string
  /** Human-readable formatted label for display */
  displayLabel: string
  /** Original Candid type name */
  candidType: string
  /** What it becomes after display transformation */
  displayType: DisplayType
  /** Original raw value before transformation (present after resolution) */
  raw?: unknown
  /** Value after display transformation (present after resolution) */
  value?: unknown
  /** Resolve this node with a value, returning a new resolved node */
  resolve(data: unknown): ResolvedNode<T>
}

// ════════════════════════════════════════════════════════════════════════════
// Type-Specific Extras (embedded directly in node)
// For compound types, children are stored directly in their respective fields
// ════════════════════════════════════════════════════════════════════════════

interface RecordNodeExtras {
  /** Child fields of the record */
  fields: Record<string, ResultNode>
}

interface VariantNodeExtras {
  /** All variant options as schema */
  options: Record<string, ResultNode>
  /** The resolved selected option value */
  selectedValue: ResultNode
  /** The selected option key (populated after resolution) */
  selected?: string
}

interface TupleNodeExtras {
  /** Tuple element fields */
  items: ResultNode[]
}

interface VectorNodeExtras {
  /** Vector element fields */
  items: ResultNode[]
}

interface OptionalNodeExtras {
  /** The inner value, or null if not enabled */
  value: ResultNode | null
}

interface RecursiveNodeExtras {
  /** The resolved recursive inner type */
  inner: ResultNode
}

interface BlobNodeExtras {
  /** The blob value as hex/base64 or Uint8Array */
  value: string | Uint8Array
  /** Hash of the blob content */
  hash: string
  /** Length in bytes */
  length: number
}

interface NumberNodeExtras {
  /** Detected number format */
  format: NumberFormat
  /** The numeric value */
  value: string | number
}

interface TextNodeExtras {
  /** Detected text format */
  format: TextFormat
  /** The text value */
  value: string
}

interface PrincipalNodeExtras {
  /** Detected text format */
  format: TextFormat
  /** The principal value as string */
  value: string
}

interface BooleanNodeExtras {
  /** The boolean value */
  value: boolean
}

interface NullNodeExtras {
  /** The null value */
  value: null
}

interface UnknownNodeExtras {
  /** The unknown value */
  value: unknown
}

interface FuncNodeExtras {
  /** The canister principal of the function reference */
  canisterId: string
  /** The method name of the function reference */
  methodName: string
}

interface FuncRecordNodeExtras {
  /** The canister principal extracted from the func reference */
  canisterId: string
  /** The method name extracted from the func reference */
  methodName: string
  /** Whether the referenced function is "query" or "update" */
  funcType: "query" | "update"
  /** The raw IDL.FuncClass for encoding/decoding calls */
  funcClass: IDL.FuncClass
  /** The key of the func field in the record */
  funcFieldKey: string
  /** The func field node */
  funcField: ResultNode<"func">
  /** Non-func fields — the default arguments for invoking the callback */
  argFields: Record<string, ResultNode>
  /** All fields including the func field (superset of argFields + funcField) */
  fields: Record<string, ResultNode>
  /**
   * The display-type argument values extracted from argFields, ready to pass
   * to `callMethod({ args: defaultArgs })`. Populated after `resolve()`.
   *
   * For a func that takes `(record { start: nat; length: nat })`, this would
   * be `[{ start: "100", length: "50" }]` (display strings for BigInt fields).
   *
   * `undefined` before resolve.
   */
  defaultArgs?: unknown[]
}

type NodeTypeExtras<T extends VisitorDataType> = T extends "record"
  ? RecordNodeExtras
  : T extends "funcRecord"
    ? FuncRecordNodeExtras
    : T extends "variant"
      ? VariantNodeExtras
      : T extends "tuple"
        ? TupleNodeExtras
        : T extends "vector"
          ? VectorNodeExtras
          : T extends "optional"
            ? OptionalNodeExtras
            : T extends "recursive"
              ? RecursiveNodeExtras
              : T extends "blob"
                ? BlobNodeExtras
                : T extends "number"
                  ? NumberNodeExtras
                  : T extends "text"
                    ? TextNodeExtras
                    : T extends "principal"
                      ? PrincipalNodeExtras
                      : T extends "boolean"
                        ? BooleanNodeExtras
                        : T extends "null"
                          ? NullNodeExtras
                          : T extends "func"
                            ? FuncNodeExtras
                            : T extends "unknown"
                              ? UnknownNodeExtras
                              : {}

/**
 * A unified result node that contains both schema and resolved value.
 * When used as schema only, `raw` is undefined.
 * When resolved, `raw` contains the original data.
 *
 * Compound types (record, variant, tuple, optional, vector) store
 * resolved children directly in their structure fields.
 * Primitive types store the display value in `value`.
 */
export type ResultNode<T extends VisitorDataType = VisitorDataType> =
  T extends any ? ResultNodeBase<T> & NodeTypeExtras<T> : never

/**
 * A resolved node has `raw` populated and children resolved.
 */
export type ResolvedNode<T extends VisitorDataType = VisitorDataType> =
  ResultNode<T> & {
    raw: unknown
  }

// ════════════════════════════════════════════════════════════════════════════
// Convenience Type Aliases
// ════════════════════════════════════════════════════════════════════════════

export type RecordNode = ResultNode<"record">
export type FuncRecordNode = ResultNode<"funcRecord">
export type VariantNode = ResultNode<"variant">
export type TupleNode = ResultNode<"tuple">
export type OptionalNode = ResultNode<"optional">
export type VectorNode = ResultNode<"vector">
export type BlobNode = ResultNode<"blob">
export type RecursiveNode = ResultNode<"recursive">
export type PrincipalNode = ResultNode<"principal">
export type NumberNode = ResultNode<"number">
export type TextNode = ResultNode<"text">
export type BooleanNode = ResultNode<"boolean">
export type NullNode = ResultNode<"null">
export type FuncNode = ResultNode<"func">
export type UnknownNode = ResultNode<"unknown">

// ════════════════════════════════════════════════════════════════════════════
// Method & Service Level
// ════════════════════════════════════════════════════════════════════════════

/**
 * Metadata for a single method's return values.
 * Use this to render method results.
 */
export interface MethodMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  /** Whether this is a "query" or "update" call */
  functionType: FunctionType
  /** The method name as defined in the Candid interface */
  functionName: Name
  /** Array of result node descriptors, one per return value */
  returns: ResultNode[]
  /** Number of return values */
  returnCount: number
  /**
   * Resolve the method result schema with actual return data.
   * @param data The raw return data from the canister
   * @returns A resolved result with display-friendly values
   */
  resolve(data: ActorMethodReturnType<A[Name]>): MethodResult<A>
}

/**
 * A resolved method result with display-friendly values.
 */
export interface MethodResult<A = BaseActor> {
  /** Whether this is a "query" or "update" call */
  functionType: FunctionType
  /** The method name */
  functionName: FunctionName<A>
  /** Resolved return values */
  results: ResolvedNode[]
  /** Original raw data from the canister */
  raw: ActorMethodReturnType<A[FunctionName<A>]>
}

/**
 * Service-level metadata mapping method names to their return metadata.
 */
export type ServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]: MethodMeta<A, K>
}
