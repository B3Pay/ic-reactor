// Turns what a person typed into an ICRC-1 transfer, or refuses it. Nothing
// here guesses: a principal must be canonical text, and an amount must be a
// plain decimal the token's decimals can hold exactly.
import { isPrincipal, principal } from "@candid-core/schema"
import { parseUnits } from "@ic-reactor/core"
import type { TransferArg } from "./canisters/icrc1.ts"

export interface TransferForm {
  /** The recipient's principal. */
  readonly to: string
  /** The amount, in tokens: "1.5". */
  readonly amount: string
  /** An explicit fee in tokens, or "" to let the ledger charge its own. */
  readonly fee: string
}

export type ReadTransfer =
  | { readonly ok: true; readonly arg: TransferArg }
  | {
      readonly ok: false
      readonly field: keyof TransferForm
      readonly reason: string
    }

/** The amount `text` stands for, in base units, or why it is refused. */
function readAmount(
  text: string,
  decimals: number
): { ok: true; units: bigint } | { ok: false; reason: string } {
  try {
    return { ok: true, units: parseUnits(text, decimals) }
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false,
        reason: text.trim().startsWith("-")
          ? "An amount cannot be negative."
          : `At most ${decimals} decimals.`,
      }
    }
    return {
      ok: false,
      reason:
        'Write plain digits with at most one "." (no exponent, grouping or sign).',
    }
  }
}

/**
 * The `icrc1_transfer` argument for `form`, or the first field that is
 * refused. `nowMs` becomes `created_at_time`, so that sending the same
 * argument twice is answered `Duplicate` instead of moving the funds twice.
 *
 * `memo` is this transfer's own, 16 random bytes: the ledger takes two
 * arguments for one only when every field matches, so two different transfers
 * of the same amount to the same account made in the same millisecond are not
 * taken for each other's `Duplicate`. Read the form once per transfer, and
 * send the argument it gave again, memo included, to re-send that transfer.
 */
export function readTransferForm(
  form: TransferForm,
  decimals: number,
  nowMs: number = Date.now(),
  memo: Uint8Array = newMemo()
): ReadTransfer {
  const to = form.to.trim()
  if (!isPrincipal(to)) {
    return { ok: false, field: "to", reason: "Not a principal." }
  }
  const amount = readAmount(form.amount, decimals)
  if (!amount.ok) return { ok: false, field: "amount", reason: amount.reason }
  if (amount.units === 0n) {
    return { ok: false, field: "amount", reason: "Send more than zero." }
  }
  let fee: bigint | null = null
  if (form.fee.trim() !== "") {
    const read = readAmount(form.fee, decimals)
    if (!read.ok) return { ok: false, field: "fee", reason: read.reason }
    fee = read.units
  }
  return {
    ok: true,
    arg: {
      to: { owner: principal(to), subaccount: null },
      amount: amount.units,
      fee,
      memo,
      from_subaccount: null,
      created_at_time: BigInt(nowMs) * 1_000_000n,
    },
  }
}

/** A memo of its own for one transfer: 16 bytes from `crypto.getRandomValues`. */
export function newMemo(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}
