import {
  VisitorDataType,
  CompoundField,
  FieldNode,
  FieldByType,
  PrimitiveField,
  RecordField,
  TupleField,
  VariantField,
} from "./types"

/**
 * Type guard for checking specific field types.
 *
 * @example
 * ```tsx
 * function FieldInput({ field }: { field: Field }) {
 *   if (isFieldType(field, 'record')) {
 *     // field is now typed as RecordField
 *     return <RecordInput field={field} />
 *   }
 *   if (isFieldType(field, 'text')) {
 *     // field is now typed as TextField
 *     return <TextInput field={field} />
 *   }
 *   // ...
 * }
 * ```
 */
export function isFieldType<T extends VisitorDataType>(
  field: FieldNode,
  type: T
): field is FieldByType<T> {
  return field.type === type
}

/** Check if a field is a compound type (contains other fields) */
export function isCompoundField(field: FieldNode): field is CompoundField {
  return [
    "record",
    "variant",
    "tuple",
    "optional",
    "vector",
    "recursive",
  ].includes(field.type)
}

/** Check if a field is a primitive type */
export function isPrimitiveField(field: FieldNode): field is PrimitiveField {
  return ["principal", "number", "text", "boolean", "null"].includes(field.type)
}

/** Check if a field has children (for iteration) */
export function hasChildFields(
  field: FieldNode
): field is RecordField | VariantField | TupleField {
  return "fields" in field && Array.isArray((field as RecordField).fields)
}

// ════════════════════════════════════════════════════════════════════════════
// Label Formatting Utilities
// ════════════════════════════════════════════════════════════════════════════

/**
 * Format a raw Candid label into a human-readable display label.
 * Handles common patterns like "__arg0", "_0_", "snake_case", etc.
 *
 * @example
 * ```ts
 * formatLabel("__arg0")        // "Arg 0"
 * formatLabel("_0_")           // "Item 0"
 * formatLabel("created_at")    // "Created At"
 * formatLabel("userAddress")   // "User Address"
 * ```
 */
export function formatLabel(label: string): string {
  // Handle argument labels: __arg0 -> Arg 0
  if (label.startsWith("__arg")) {
    const num = label.slice(5)
    return `Arg ${num}`
  }

  // Handle tuple index labels: _0_ -> Item 0
  if (/^_\d+_$/.test(label)) {
    const num = label.slice(1, -1)
    return `Item ${num}`
  }

  // Handle item labels for vectors: label_item -> Item
  if (label.endsWith("_item")) {
    return "Item"
  }

  // Convert snake_case or just clean up underscores
  // and capitalize each word
  return label
    .replace(/^_+|_+$/g, "") // Remove leading/trailing underscores
    .replace(/_/g, " ") // Replace underscores with spaces
    .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space before capitals (camelCase)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
