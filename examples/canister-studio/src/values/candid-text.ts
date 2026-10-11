// STUB (FOUNDATION): the signatures are the contract; B2 implements them.
import type { AnyFieldSchema } from "@candid-core/schema"

/** A value as Candid text: `record { owner = principal "…"; amount = 5 : nat }`. */
export function candidText(schema: AnyFieldSchema, value: unknown): string {
  void schema
  void value
  throw new Error("not implemented")
}

/** A call's arguments as Candid text: `(arg0, arg1)`. */
export function candidArgsText(
  args: readonly AnyFieldSchema[],
  values: readonly unknown[]
): string {
  void args
  void values
  throw new Error("not implemented")
}
