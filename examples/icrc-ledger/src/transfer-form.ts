// Turns what a person typed into an ICRC-1 transfer, or refuses it, and
// gives a transfer its time as it is sent. Nothing here guesses: a principal
// must be canonical text, and an amount must be a plain decimal the token's
// decimals can hold exactly.
import { isPrincipal, principal } from "@meantjs/schema"
import { parseUnits, type Canister, type Client } from "@ic-reactor/core"
import type { Actor, TransferArg } from "./canisters/icrc1.ts"

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
 * refused. `created_at_time` is left empty: `stamped` sets it as the transfer
 * is sent, and with it sending the same argument twice is answered
 * `Duplicate` instead of moving the funds twice.
 *
 * `memo` is this transfer's own, 16 random bytes: the ledger takes two
 * arguments for one only when every field matches, so two different transfers
 * of the same amount to the same account stamped with the same time are not
 * taken for each other's `Duplicate`. Read the form once per transfer, and
 * send the argument that was sent again, memo and time included, to re-send
 * that transfer.
 */
export function readTransferForm(
  form: TransferForm,
  decimals: number,
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
      created_at_time: null,
    },
  }
}

/**
 * `arg` as it is sent. A new transfer gets the IC's time in
 * `created_at_time`: `client.time(ledger)` reads it from a certificate, so
 * the stamp comes from the clock the ledger checks it against, and not from
 * this computer's, which may be wrong. That time moves about once a second,
 * which is why each transfer has a memo of its own as well.
 *
 * A transfer that has its time is one sent again. It is returned as it is,
 * the same object: only the same argument is the same transfer to the ledger.
 */
export async function stamped(
  client: Pick<Client, "time">,
  ledger: Canister<Actor>,
  arg: TransferArg
): Promise<TransferArg> {
  return arg.created_at_time === null
    ? { ...arg, created_at_time: await client.time(ledger) }
    : arg
}

/** A memo of its own for one transfer: 16 bytes from `crypto.getRandomValues`. */
export function newMemo(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}
