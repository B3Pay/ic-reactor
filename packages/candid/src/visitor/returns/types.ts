import type {
  BaseActor,
  FunctionName,
  FunctionType,
  ActorMethodReturnType,
} from "@ic-reactor/core"

// ════════════════════════════════════════════════════════════════════════════
// Core Types & Formats
// ════════════════════════════════════════════════════════════════════════════

export type NodeType =
  | "record"
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
  | "unknown"

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
  | "unknown"

export type NumberFormat = "timestamp" | "cycle" | "value" | "token" | "normal"
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

// ════════════════════════════════════════════════════════════════════════════
// Unified Result Node - Single Structure for Schema & Resolved Data
// ════════════════════════════════════════════════════════════════════════════

/**
 * Base properties shared by all result nodes.
 */
interface ResultNodeBase<T extends NodeType = NodeType> {
  /** The Candid type category */
  type: T
  /** Human-readable label */
  label: string
  /** Original Candid type name */
  candidType: string
  /** What it becomes after display transformation */
  displayType: DisplayType
  /** Original raw value before transformation (present after resolution) */
  raw?: unknown
}

// ════════════════════════════════════════════════════════════════════════════
// Type-Specific Extras (embedded directly in node)
// For compound types, children are stored directly in their respective fields
// ════════════════════════════════════════════════════════════════════════════

type NodeTypeExtras<T extends NodeType> = T extends "record"
  ? { fields: Record<string, ResultNode> }
  : T extends "variant"
    ? { selectedOption: ResultNode; selected?: string }
    : T extends "tuple" | "vector"
      ? { items: ResultNode[] }
      : T extends "optional"
        ? { value: ResultNode | null }
        : T extends "recursive"
          ? { inner: ResultNode }
          : T extends "blob"
            ? { value: string }
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
export type ResultNode<T extends NodeType = NodeType> = ResultNodeBase<T> &
  NodeTypeExtras<T> & {
    /** Resolve this node with a value, returning a new resolved node */
    resolve(data: unknown): ResolvedNode<T>
    value?: unknown
  }

/**
 * A resolved node has `raw` populated and children resolved.
 */
export type ResolvedNode<T extends NodeType = NodeType> = ResultNode<T> & {
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

export interface MethodMeta<
  A = BaseActor,
  Name extends FunctionName<A> = FunctionName<A>,
> {
  functionType: FunctionType
  functionName: Name
  returns: ResultNode[]
  returnCount: number
  /**
   * Resolve the method result schema with actual return data.
   */
  resolve(data: ActorMethodReturnType<A[Name]>): ResolvedMethodResult<A>
}

export interface ResolvedMethodResult<A = BaseActor> {
  functionType: FunctionType
  functionName: FunctionName<A>
  results: ResolvedNode[]
  raw: ActorMethodReturnType<A[FunctionName<A>]>
}

export type ServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]: MethodMeta<A, K>
}
