// What `pnpm faucet <principal> [amount]` was asked for, checked before any
// ICP moves: a principal made with `principal()` (never cast), and an amount
// read with `parseUnits` (no exponent, no grouping, at most 8 decimals).
import { principal, type Principal } from "@candid-core/schema"
import { parseUnits } from "@ic-reactor/core"

/** ICP's decimals, which `icp token transfer` amounts are written in. */
const ICP_DECIMALS = 8

export const DEFAULT_AMOUNT = "10"

export type FaucetRequest =
  | { readonly ok: true; readonly to: Principal; readonly amount: string }
  | { readonly ok: false; readonly reason: string }

export function readFaucetArgs(args: readonly string[]): FaucetRequest {
  const [to, amount = DEFAULT_AMOUNT, ...rest] = args
  if (to === undefined || rest.length > 0) {
    return {
      ok: false,
      reason: "Usage: pnpm faucet <principal> [amount in ICP]",
    }
  }
  let receiver: Principal
  try {
    receiver = principal(to)
  } catch {
    return { ok: false, reason: `Not a principal: ${to}` }
  }
  let units: bigint
  try {
    units = parseUnits(amount, ICP_DECIMALS)
  } catch {
    return {
      ok: false,
      reason: `Not an ICP amount: ${amount} (plain digits, at most ${ICP_DECIMALS} decimals)`,
    }
  }
  if (units === 0n) return { ok: false, reason: "Send more than zero." }
  return { ok: true, to: receiver, amount }
}
