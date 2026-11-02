import { principal, type Principal } from "@meantjs/schema"
import type { CanisterInterface, MethodInfo } from "../interface/types.ts"
import { prepareCall, type PreparedCall } from "./prepare.ts"

/**
 * A read that shows whether a write with an unknown outcome happened: for a
 * ledger, the sending account's balance.
 */
export interface ReadBack {
  readonly method: MethodInfo
  readonly call: PreparedCall
  /** What to look for in the answer. */
  readonly label: string
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const subaccountOf = (arg: Record<string, unknown>): unknown =>
  Object.hasOwn(arg, "from_subaccount") ? (arg.from_subaccount ?? null) : null

function asPrincipal(text: string): Principal | undefined {
  try {
    return principal(text)
  } catch {
    return undefined
  }
}

/** The query `name` of the interface, if it has one taking one argument. */
function query(iface: CanisterInterface, name: string): MethodInfo | undefined {
  const method = iface.method(name)
  return method !== undefined &&
    (method.mode === "query" || method.mode === "composite_query") &&
    method.args.length === 1 &&
    method.results.length > 0
    ? method
    : undefined
}

function readBack(
  method: MethodInfo | undefined,
  arg: unknown,
  label: string
): ReadBack | undefined {
  if (method === undefined) return undefined
  const call = prepareCall(method, [arg])
  return call === undefined ? undefined : { method, call, label }
}

/**
 * The read that tells whether `method` ran with `values` as `caller`, or
 * `undefined` when the studio knows none: then the reader picks a query.
 *
 * - An ICRC-1 transfer or the ICP ledger's `transfer`: `icrc1_balance_of` of
 *   the sending account (the caller, and `from_subaccount`).
 * - An ICRC-2 `transfer_from`: the balance of its `from` account.
 * - An ICRC-2 `approve`: `icrc2_allowance` of the caller's account for the
 *   spender.
 */
export function suggestReadBack(
  iface: CanisterInterface,
  method: MethodInfo,
  values: readonly unknown[],
  caller: string
): ReadBack | undefined {
  const [arg] = values
  if (!isObject(arg)) return undefined
  const owner = asPrincipal(caller)
  switch (method.name) {
    case "icrc1_transfer":
    case "transfer": {
      if (owner === undefined) return undefined
      return readBack(
        query(iface, "icrc1_balance_of"),
        { owner, subaccount: subaccountOf(arg) },
        "The sending account's balance: lower by the amount and the fee if it ran."
      )
    }
    case "icrc2_transfer_from":
      return readBack(
        query(iface, "icrc1_balance_of"),
        arg.from,
        "The source account's balance: lower by the amount and the fee if it ran."
      )
    case "icrc2_approve": {
      if (owner === undefined) return undefined
      return readBack(
        query(iface, "icrc2_allowance"),
        {
          account: { owner, subaccount: subaccountOf(arg) },
          spender: arg.spender,
        },
        "The spender's allowance: the approved amount if it ran."
      )
    }
    default:
      return undefined
  }
}
