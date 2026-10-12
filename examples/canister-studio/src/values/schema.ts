import type { AnyFieldSchema } from "@candid-core/schema"
import { isResultSchema } from "@candid-core/schema/validate"
import type { MethodInfo } from "../interface/types.ts"
import {
  armOf,
  fieldsOf,
  getOwn,
  orderFields,
  resolve,
  type RecordNode,
} from "../lib/schema.ts"

// Schema reading helpers of the viewers and the Candid text printer: the
// shared ones (lib/schema.ts) re-exported, plus what only a reply needs.

export {
  armOf,
  childPath,
  displayLabel,
  elementsOf,
  fieldsOf,
  isBytes,
  isTagOnly,
  numericLabelId,
  resolve,
  type RecordNode,
  type TupleNode,
  type VariantNode,
} from "../lib/schema.ts"

/** A record's fields for display: required first, as the forms order them. */
export function orderedFields(
  node: RecordNode
): (readonly [string, AnyFieldSchema])[] {
  return orderFields(fieldsOf(node))
}

/** Own-property read: a record field named "toString" is not the prototype's. */
export function ownValue(value: object, key: string): unknown {
  return getOwn(value as Record<string, unknown>, key)
}

/**
 * Which schemas describe what a call resolves with. ic-reactor resolves
 * `undefined` for no results, the value for one, the tuple for several, and
 * the Ok payload when the one result is an Ok/Err variant (an Err rejects as
 * a `canister_err` ReactorError whose `err` is the Err payload).
 */
export type ReplyShape =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly schema: AnyFieldSchema }
  | {
      readonly kind: "result"
      readonly ok: AnyFieldSchema
      readonly err: AnyFieldSchema
      readonly okTag: "Ok" | "ok"
      readonly errTag: "Err" | "err"
    }
  | { readonly kind: "many"; readonly schemas: readonly AnyFieldSchema[] }

export function replySchemas(method: Pick<MethodInfo, "results">): ReplyShape {
  const { results } = method
  const [first] = results
  if (first === undefined) return { kind: "none" }
  if (results.length > 1) return { kind: "many", schemas: results }
  if (!isResultSchema(first)) return { kind: "one", schema: first }
  const node = resolve(first)
  if (node.kind !== "variant") return { kind: "one", schema: first }
  // isResultSchema accepts exactly Ok/Err or ok/err, never a mix.
  const capitalized = armOf(node, "Ok") !== undefined
  const okTag = capitalized ? "Ok" : "ok"
  const errTag = capitalized ? "Err" : "err"
  const ok = armOf(node, okTag)
  const err = armOf(node, errTag)
  if (ok === undefined || err === undefined)
    return { kind: "one", schema: first }
  return { kind: "result", ok, err, okTag, errTag }
}
