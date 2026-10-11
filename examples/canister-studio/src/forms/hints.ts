// STUB (FOUNDATION): the types and signatures are the contract; B1 implements.
import type { AnyFieldSchema } from "@candid-core/schema"
import type { TokenUnits } from "../lib/format.ts"

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

/**
 * Hints from field names and types: created_at_time, amount/fee (with
 * units), memo, subaccounts, principals.
 */
export function heuristicHints(opts?: { units?: TokenUnits }): HintResolver {
  void opts
  return () => undefined
}

/** One resolver over several (later resolvers refine earlier ones). */
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
