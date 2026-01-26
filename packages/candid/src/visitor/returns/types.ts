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
}

/**
 * A unified result node that contains both schema and resolved value.
 * When used as schema only, `value` and `raw` are undefined.
 * When resolved, `value` contains the display-ready data and `raw` the original.
 */
export type ResultNode<T extends NodeType = NodeType> = ResultNodeBase<T> &
  NodeTypeExtras<T> & {
    /** Display-ready value (present after resolution) */
    value?: NodeValue<T>
    /** Original raw value before transformation */
    raw?: unknown
    /** Resolve this node with a value, returning a new resolved node */
    resolve(data: unknown): ResolvedNode<T>
  }

// ════════════════════════════════════════════════════════════════════════════
// Type-Specific Extras (embedded directly in node)
// ════════════════════════════════════════════════════════════════════════════

type NodeTypeExtras<T extends NodeType> = T extends "record"
  ? { fields: ResultNode[] }
  : T extends "variant"
    ? { options: string[]; optionNodes: ResultNode[] }
    : T extends "tuple"
      ? { items: ResultNode[] }
      : T extends "optional"
        ? { inner: ResultNode }
        : T extends "vector"
          ? { item: ResultNode }
          : T extends "blob"
            ? { displayHint: "hex" }
            : T extends "recursive"
              ? { typeName: string; extract: () => ResultNode }
              : T extends "number"
                ? { format: NumberFormat }
                : T extends "text" | "principal"
                  ? { format: TextFormat }
                  : object // boolean, null, unknown have no extras

// ════════════════════════════════════════════════════════════════════════════
// Resolved Value Types (what `value` contains after resolution)
// ════════════════════════════════════════════════════════════════════════════

type NodeValue<T extends NodeType> = T extends "record"
  ? Record<string, ResolvedNode>
  : T extends "variant"
    ? { option: string; data: ResolvedNode }
    : T extends "tuple"
      ? ResolvedNode[]
      : T extends "optional"
        ? ResolvedNode | null
        : T extends "vector"
          ? ResolvedNode[]
          : T extends "blob"
            ? string
            : T extends "recursive"
              ? ResolvedNode
              : T extends "principal" | "text"
                ? string
                : T extends "number"
                  ? string | number
                  : T extends "boolean"
                    ? boolean
                    : T extends "null"
                      ? null
                      : unknown

// ════════════════════════════════════════════════════════════════════════════
// Resolved Node (node with value populated)
// ════════════════════════════════════════════════════════════════════════════

/**
 * A resolved node has `value` and `raw` populated.
 */
export type ResolvedNode<T extends NodeType = NodeType> = ResultNode<T> & {
  value: NodeValue<T>
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
