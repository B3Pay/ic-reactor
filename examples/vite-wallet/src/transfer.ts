// Scenario 5, the part without React: typed text to an `icrc1_transfer`
// argument or the reason it is refused before anything is sent, and what each
// `Err` of the ledger means.
import { isPrincipal, principal } from "@candid-core/schema"
import { parseUnits } from "@ic-reactor/core"
import type { TransferArg, TransferError } from "./canisters/ledger.ts"
import { showAmount, type Token } from "./token.ts"

export interface TransferForm {
  /** The recipient's principal, as typed. */
  readonly to: string
  /** The amount in tokens, as typed: "1.5". */
  readonly amount: string
}

export type ReadTransfer =
  | { readonly ok: true; readonly arg: TransferArg }
  | {
      readonly ok: false
      readonly field: keyof TransferForm
      readonly reason: string
    }

/**
 * The transfer `form` asks for, or the first field that is refused.
 *
 * - The amount goes through `parseUnits`, which takes only plain decimal text
 *   with at most `token.decimals` fraction digits: "1e3", "1,5" and "-1" are
 *   refused here, and nothing reaches the ledger.
 * - `fee` is the fee the person was shown. Had the ledger's fee changed since,
 *   it answers `BadFee` instead of charging the new one silently.
 * - `created_at_time` (`nowMs`, in nanoseconds) makes the transfer
 *   deduplicated: the same argument sent again by the same account is
 *   answered `Duplicate`, and pays nothing twice.
 * - `memo` is this transfer's own, 16 random bytes: the ledger takes two
 *   arguments for one only when every field matches, so two different
 *   transfers of the same amount made in the same millisecond are not taken
 *   for each other's `Duplicate`. Read the form once per transfer, and re-send
 *   the argument it gave, memo included.
 */
export function readTransferForm(
  form: TransferForm,
  token: Pick<Token, "decimals" | "fee">,
  nowMs: number = Date.now(),
  memo: Uint8Array = newMemo()
): ReadTransfer {
  const to = form.to.trim()
  if (!isPrincipal(to)) {
    return { ok: false, field: "to", reason: "Not a principal." }
  }
  let amount: bigint
  try {
    amount = parseUnits(form.amount, token.decimals)
  } catch (error) {
    return {
      ok: false,
      field: "amount",
      reason:
        error instanceof RangeError
          ? form.amount.trim().startsWith("-")
            ? "An amount cannot be negative."
            : `At most ${token.decimals} decimals.`
          : 'Write plain digits with at most one "." (no exponent, grouping or sign).',
    }
  }
  if (amount === 0n) {
    return { ok: false, field: "amount", reason: "Send more than zero." }
  }
  return {
    ok: true,
    arg: {
      to: { owner: principal(to), subaccount: null },
      amount,
      fee: token.fee,
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

/** What the ledger's `Err` means, in a sentence. */
export function describeTransferError(
  err: TransferError,
  token: Token
): string {
  switch (err.tag) {
    case "InsufficientFunds":
      return `Insufficient funds: the balance is ${showAmount(err.value.balance, token)}, less than the amount plus the fee.`
    case "BadFee":
      return `Bad fee: the ledger now charges ${showAmount(err.value.expected_fee, token)}. Nothing moved; send again to pay that fee.`
    case "Duplicate":
      return `Duplicate of block ${err.value.duplicate_of}: this exact transfer went through already, and was not made twice.`
    case "TooOld":
      return "Too old: created_at_time is outside the ledger's deduplication window."
    case "CreatedInFuture":
      return "Created in the future: the ledger's clock is behind created_at_time."
    case "BadBurn":
      return `Bad burn: burn at least ${showAmount(err.value.min_burn_amount, token)}.`
    case "TemporarilyUnavailable":
      return "The ledger is temporarily unavailable."
    case "GenericError":
      return `Error ${err.value.error_code}: ${err.value.message}`
  }
}
