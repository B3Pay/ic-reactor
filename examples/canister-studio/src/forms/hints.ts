import type { AnyFieldSchema } from "@meantjs/schema"
import type { TokenUnits } from "../lib/format.ts"
import { fieldsOf, resolve } from "./engine.ts"

/** Presentation hints for one field; the schema still decides validity. */
export interface FieldHint {
  label?: string
  description?: string
  placeholder?: string
  /** A bigint edited as a decimal via parseUnits/formatUnits, with a raw toggle. */
  units?: TokenUnits
  widget?: "timestamp-nanos" | "memo-text" | "subaccount" | "textarea"
  /** Starts filled with the current time (`created_at_time`). */
  nowByDefault?: boolean
  hidden?: boolean
}

export type HintResolver = (ctx: {
  path: string
  key?: string
  schema: AnyFieldSchema
  method: string
}) => FieldHint | undefined

/** The node under any number of `opt`s: hints describe the value, not the option. */
function valueNode(schema: AnyFieldSchema) {
  let node = resolve(schema)
  while (node.kind === "opt") node = resolve(node.inner)
  return node
}

const isPrimitive = (schema: AnyFieldSchema, ...names: string[]): boolean => {
  const node = valueNode(schema)
  return node.kind === "primitive" && names.includes(node.primitive)
}

/** A time in nanoseconds: nat64, or the ICP ledger's `record { timestamp_nanos : nat64 }`. */
function isNanosTime(schema: AnyFieldSchema): boolean {
  if (isPrimitive(schema, "nat64")) return true
  const node = valueNode(schema)
  if (node.kind !== "record") return false
  const fields = fieldsOf(node)
  const only = fields.length === 1 ? fields[0] : undefined
  return only !== undefined && isPrimitive(only[1], "nat64")
}

const AMOUNT_KEYS = new Set([
  "amount",
  "fee",
  "expected_allowance",
  "allowance",
])
const TIME_KEYS = /^(created_at_time|expires_at|timestamp|timestamp_nanos)$/
const PRINCIPAL_KEYS = new Set([
  "owner",
  "to",
  "spender",
  "from",
  "controller",
  "canister_id",
])

/**
 * Hints from field names and types, for ledgers and the like:
 * - `created_at_time` (nat64 or ICP's TimeStamp record): a timestamp widget,
 *   filled with the time of sending, so a retried transfer is deduplicated;
 *   `expires_at`, `timestamp_nanos`: the timestamp widget alone.
 * - `amount`, `fee`, `expected_allowance`, `allowance` (nat or nat64), and
 *   ICP's `e8s` when the units have 8 decimals: edited in `units`, when given.
 * - `memo` (blob): typed as text, sent as its UTF-8 bytes.
 * - `subaccount`, `from_subaccount`, `spender_subaccount`, … (blob): the
 *   subaccount helper (32 bytes, from a number).
 * - `owner`, `to`, `spender`, … (principal): principal placeholder text.
 */
export function heuristicHints(opts?: { units?: TokenUnits }): HintResolver {
  const units = opts?.units
  return ({ key, schema }) => {
    if (key === undefined) return undefined
    if (key === "created_at_time" && isNanosTime(schema)) {
      return {
        widget: "timestamp-nanos",
        nowByDefault: true,
        description:
          "Deduplicates the call: the ledger refuses a second identical one within its window (Duplicate), so a re-send cannot pay twice. Set to the time of sending.",
      }
    }
    if (TIME_KEYS.test(key) && isPrimitive(schema, "nat64")) {
      return { widget: "timestamp-nanos" }
    }
    if (units !== undefined && isPrimitive(schema, "nat", "nat64")) {
      if (AMOUNT_KEYS.has(key)) return { units }
      if (key === "e8s" && units.decimals === 8) return { units }
    }
    if (key === "memo") {
      if (valueNode(schema).kind === "blob")
        return {
          widget: "memo-text",
          description:
            "Stored with the transaction. Typed as text and sent as its UTF-8 bytes; most ICRC-1 ledgers accept up to 32 bytes.",
        }
      if (isPrimitive(schema, "nat64"))
        return { description: "A number stored with the transaction." }
    }
    if (/(^|_)subaccount$/.test(key) && valueNode(schema).kind === "blob") {
      return {
        widget: "subaccount",
        description:
          "32 bytes that pick one of the owner's accounts; leave it out for the default account.",
      }
    }
    if (PRINCIPAL_KEYS.has(key) && isPrimitive(schema, "principal")) {
      return { placeholder: "Principal text, such as aaaaa-aa" }
    }
    return undefined
  }
}

/** One resolver over several: a later resolver's hint fields override an earlier one's. */
export function combineHints(...r: (HintResolver | undefined)[]): HintResolver {
  return (ctx) => {
    let hint: FieldHint | undefined
    for (const resolve of r) {
      const next = resolve?.(ctx)
      if (next !== undefined) hint = { ...hint, ...next }
    }
    return hint
  }
}
