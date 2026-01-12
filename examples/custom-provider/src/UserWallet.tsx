/**
 * UserWallet Component
 *
 * Provides transfer functionality for authenticated users.
 */
import { useICRC1Context } from "./ICRC1Provider"
import { Principal } from "@icp-sdk/core/principal"
import { useRef, useState } from "react"

interface UserWalletProps {
  principal: Principal
}

const UserWallet = ({ principal }: UserWalletProps) => {
  const toRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null)
  const [transferError, setTransferError] = useState<string | null>(null)

  const { hooks } = useICRC1Context()

  const { refetch } = hooks.useActorQuery({
    functionName: "icrc1_balance_of",
    args: [{ owner: principal, subaccount: [] }],
  })

  const { mutate, isPending } = hooks.useActorMutation({
    functionName: "icrc1_transfer",
    onSuccess: (data) => {
      setTransferError(null)
      setTransferSuccess(`Transfer successful! Block: ${data?.toString()}`)
      refetch()
      // Clear form
      if (amountRef.current) amountRef.current.value = ""
    },
    onError: (error) => {
      setTransferSuccess(null)
      setTransferError(error.message || "Transfer failed")
    },
    onCanisterError: (error) => {
      setTransferSuccess(null)
      setTransferError(`Canister error: ${JSON.stringify(error.err)}`)
    },
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTransferSuccess(null)
    setTransferError(null)

    try {
      const to = Principal.fromText(toRef.current?.value || "")
      const amount = BigInt(amountRef.current?.value || "0")

      mutate([
        {
          to: { owner: to, subaccount: [] },
          amount,
          fee: [],
          memo: [],
          from_subaccount: [],
          created_at_time: [],
        },
      ])
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : "Invalid input")
    }
  }

  return (
    <div className="wallet-section">
      <div className="section-header">
        <span>💸</span>
        <h3 className="section-title">Transfer Tokens</h3>
      </div>

      <form onSubmit={onSubmit} className="transfer-form">
        <div className="form-group">
          <label className="form-label" htmlFor="recipient">
            Recipient Principal
          </label>
          <input
            id="recipient"
            className="input"
            type="text"
            ref={toRef}
            placeholder="Enter recipient principal ID"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="amount">
            Amount (in smallest units)
          </label>
          <input
            id="amount"
            className="input"
            type="number"
            ref={amountRef}
            placeholder="Enter amount to transfer"
            min="0"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isPending}
          style={{ width: "100%" }}
        >
          {isPending ? (
            <>
              <span className="spinner" />
              Processing...
            </>
          ) : (
            "🚀 Send Transfer"
          )}
        </button>
      </form>

      {transferSuccess && (
        <div className="transfer-result success">✅ {transferSuccess}</div>
      )}

      {transferError && (
        <div className="transfer-result error">❌ {transferError}</div>
      )}
    </div>
  )
}

export default UserWallet
