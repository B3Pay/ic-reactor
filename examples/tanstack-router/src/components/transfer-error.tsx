import { isCanisterError, isCallError } from "@ic-reactor/core"
import type { ReactorReturnErr } from "@ic-reactor/core"
import type { Ledger } from "@/reactor"

// Type for the transfer error from the ICRC1 ledger
export type TransferErrorType = ReactorReturnErr<
  Ledger,
  "icrc1_transfer",
  "display"
>

/**
 * Renders a user-friendly error message based on the error type.
 * Handles all ICRC1 transfer error cases with proper type safety.
 */
export function TransferError({
  error,
}: {
  error: TransferErrorType
}): React.ReactNode {
  if (isCanisterError(error)) {
    const canisterErr = error.err

    switch (canisterErr._type) {
      case "InsufficientFunds":
        return (
          <div className="space-y-1">
            <div className="font-semibold">❌ Insufficient Funds</div>
            <div className="text-xs opacity-80">
              Your balance ({canisterErr.InsufficientFunds.balance}) is not
              enough to complete this transfer.
            </div>
          </div>
        )

      case "BadFee":
        return (
          <div className="space-y-1">
            <div className="font-semibold">💰 Incorrect Fee</div>
            <div className="text-xs opacity-80">
              Expected fee: {canisterErr.BadFee.expected_fee}
            </div>
          </div>
        )

      case "BadBurn":
        return (
          <div className="space-y-1">
            <div className="font-semibold">🔥 Bad Burn Amount</div>
            <div className="text-xs opacity-80">
              Minimum burn amount: {canisterErr.BadBurn.min_burn_amount}
            </div>
          </div>
        )

      case "Duplicate":
        return (
          <div className="space-y-1">
            <div className="font-semibold">📋 Duplicate Transaction</div>
            <div className="text-xs opacity-80">
              This transaction is a duplicate of block:{" "}
              {canisterErr.Duplicate.duplicate_of}
            </div>
          </div>
        )

      case "CreatedInFuture":
        return (
          <div className="space-y-1">
            <div className="font-semibold">⏰ Created In Future</div>
            <div className="text-xs opacity-80">
              Transaction timestamp is in the future. Ledger time:{" "}
              {canisterErr.CreatedInFuture.ledger_time}
            </div>
          </div>
        )

      case "TooOld":
        return (
          <div className="space-y-1">
            <div className="font-semibold">⌛ Transaction Too Old</div>
            <div className="text-xs opacity-80">
              The transaction has expired. Please try again.
            </div>
          </div>
        )

      case "TemporarilyUnavailable":
        return (
          <div className="space-y-1">
            <div className="font-semibold">🔄 Service Unavailable</div>
            <div className="text-xs opacity-80">
              The ledger is temporarily unavailable. Please try again later.
            </div>
          </div>
        )

      case "GenericError":
        return (
          <div className="space-y-1">
            <div className="font-semibold">⚠️ Error</div>
            <div className="text-xs opacity-80">
              {canisterErr.GenericError.message} (Code:{" "}
              {canisterErr.GenericError.error_code})
            </div>
          </div>
        )

      default:
        return (
          <div className="space-y-1">
            <div className="font-semibold">❓ Unknown Canister Error</div>
            <div className="text-xs opacity-80">
              {JSON.stringify(error.err)}
            </div>
          </div>
        )
    }
  }

  if (isCallError(error)) {
    return (
      <div className="space-y-1">
        <div className="font-semibold">🌐 Network Error</div>
        <div className="text-xs opacity-80">
          Failed to communicate with the canister: {error.message}
        </div>
      </div>
    )
  }

  // Fallback for any other error type
  return (
    <div className="space-y-1">
      <div className="font-semibold">❌ Error</div>
      <div className="text-xs opacity-80">
        {(error as Error).message || "An unknown error occurred"}
      </div>
    </div>
  )
}
