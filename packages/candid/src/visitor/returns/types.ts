import type {
  BaseActor,
  FunctionName,
  FunctionType,
  ActorMethodReturnType,
} from "@ic-reactor/core"
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
  | "result"
  | "nullable"
  | "recursive"
  | "blob"
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
}

// ════════════════════════════════════════════════════════════════════════════
// Type-Specific Extras (embedded directly in node)
// For compound types, children are stored directly in their respective fields
// ════════════════════════════════════════════════════════════════════════════

type NodeTypeExtras<T extends VisitorDataType> = T extends "record"
  ? { fields: Record<string, ResultNode> }
  : T extends "variant"
    ? {
        /** All variant options as schema */
        options: Record<string, ResultNode>
        /** The resolved selected option value */
        selectedValue: ResultNode
        /** The selected option key (populated after resolution) */
        selected?: string
      }
    : T extends "tuple" | "vector"
      ? { items: ResultNode[] }
      : T extends "optional"
        ? { value: ResultNode | null }
        : T extends "recursive"
          ? { inner: ResultNode }
          : T extends "blob"
            ? { value: string | Uint8Array; hash: string; length: number }
            : T extends "number"
              ? { format: NumberFormat; value: string | number }
              : T extends "text" | "principal"
                ? { format: TextFormat; value: string }
                : T extends "boolean"
                  ? { value: boolean }
                  : T extends "null"
                    ? { value: null }
                    : { value: unknown } // unknown

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
  ResultNodeBase<T> &
    NodeTypeExtras<T> & {
      /** Resolve this node with a value, returning a new resolved node */
      resolve(data: unknown): ResolvedNode<T>
    }

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

/**
 * Props type for result display components.
 */
export type ResultDisplayProps<T extends VisitorDataType = VisitorDataType> = {
  /** The resolved result node */
  node: ResolvedNode<T>
  /** Nesting depth for indentation */
  depth?: number
}
