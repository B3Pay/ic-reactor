import { formatTokenAmount, parseTokenAmount } from "@ic-reactor/react"
import { Principal } from "@icp-sdk/core/principal"
import { useRef, useState } from "react"
import {
  icpBalanceQuery,
  icpAllowanceQuery,
  icpApproveMutation,
  icdvMintFromICPMutation,
  ICDV_CANISTER_ID,
} from "../reactor"

interface DonationProps {
  principal: Principal
}

/** ICP counts in e8s: 1 ICP is 10^8 e8s. */
const ICP_DECIMALS = 8

const Donation: React.FC<DonationProps> = ({ principal }) => {
  const icdvCanisterId = Principal.fromText(ICDV_CANISTER_ID)
  const amountRef = useRef<HTMLInputElement>(null)
  const [amountError, setAmountError] = useState<string | null>(null)

  // Balance query
  const {
    refetch: refetchBalance,
    data: balance,
    isLoading: balanceLoading,
  } = icpBalanceQuery([{ owner: principal, subaccount: [] }]).useQuery()

  // Allowance query
  const {
    refetch: refetchAllowance,
    data: allowance,
    isLoading: allowanceLoading,
  } = icpAllowanceQuery([
    {
      account: { owner: principal, subaccount: [] },
      spender: { owner: icdvCanisterId, subaccount: [] },
    },
  ]).useQuery()

  // Mint from ICP mutation
  const {
    mutate: mintFromICP,
    isPending: mintFromICPLoading,
    data: mintFromICPResult,
    error: mintFromICPError,
    reset: resetMint,
  } = icdvMintFromICPMutation.useMutation({
    onSuccess: () => {
      refetchBalance()
    },
  })

  // Approve mutation
  const {
    mutate: approve,
    isPending: approveLoading,
    data: approveResult,
    reset: resetApprove,
  } = icpApproveMutation.useMutation({
    // Mint exactly the amount that was approved.
    onSuccess: (_blockIndex, [{ amount }]) => {
      refetchAllowance()
      mintFromICP([
        {
          amount,
          source_subaccount: [],
          target: [],
        },
      ])
    },
  })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    // The typed ICP amount in e8s, exactly. Text that is not an amount, or has
    // more than 8 decimal places, is refused here instead of being sent as 0
    // or rounded.
    let amount: bigint
    try {
      amount = parseTokenAmount(amountRef.current?.value ?? "", ICP_DECIMALS)
    } catch (error) {
      setAmountError((error as Error).message)
      return
    }
    setAmountError(null)
    approve([
      {
        spender: { owner: icdvCanisterId, subaccount: [] },
        amount,
        fee: [],
        memo: [],
        created_at_time: [],
        from_subaccount: [],
        expected_allowance: [],
        expires_at: [],
      },
    ])
  }

  const formatBalance = (bal: bigint | undefined) => {
    if (bal === undefined) return "—"
    return formatTokenAmount(bal, ICP_DECIMALS, { trimTrailingZeros: false })
  }

  const isProcessing = approveLoading || mintFromICPLoading

  const handleReset = () => {
    resetApprove()
    resetMint()
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">💰</span>
        <h3 className="card-title">Your ICP Wallet</h3>
      </div>

      {/* Balance & Allowance Display */}
      <div style={{ marginBottom: "16px" }}>
        <div className="data-row">
          <span className="data-label">ICP Balance</span>
          <span className="data-value">
            {balanceLoading ? (
              <span className="spinner" />
            ) : (
              <>
                {formatBalance(balance)} ICP
                <button
                  className="btn-icon"
                  onClick={() => refetchBalance()}
                  disabled={balanceLoading}
                  style={{
                    marginLeft: "8px",
                    width: "24px",
                    height: "24px",
                    fontSize: "0.75rem",
                  }}
                >
                  ↻
                </button>
              </>
            )}
          </span>
        </div>
        <div className="data-row">
          <span className="data-label">ICDV Allowance</span>
          <span className="data-value">
            {allowanceLoading ? (
              <span className="spinner" />
            ) : (
              <>
                {allowance ? formatBalance(allowance.allowance) : "0"} ICP
                <button
                  className="btn-icon"
                  onClick={() => refetchAllowance()}
                  disabled={allowanceLoading}
                  style={{
                    marginLeft: "8px",
                    width: "24px",
                    height: "24px",
                    fontSize: "0.75rem",
                  }}
                >
                  ↻
                </button>
              </>
            )}
          </span>
        </div>
      </div>

      <div className="divider" />

      {/* Donation Form */}
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label">Donation Amount (ICP)</label>
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            placeholder="0.01"
            required
          />
          {amountError && (
            <div className="status status-error" style={{ marginTop: "8px" }}>
              ⚠️ {amountError}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={isProcessing}
          style={{ width: "100%", padding: "12px" }}
        >
          {approveLoading ? (
            <>
              <span className="spinner" style={{ marginRight: "8px" }} />
              Approving...
            </>
          ) : mintFromICPLoading ? (
            <>
              <span className="spinner" style={{ marginRight: "8px" }} />
              Minting ICDV...
            </>
          ) : (
            "💝 Donate to ICDV"
          )}
        </button>
      </form>

      {/* Result Display */}
      {Boolean(approveResult || mintFromICPResult || mintFromICPError) && (
        <div style={{ marginTop: "16px" }}>
          {Boolean(approveResult) && (
            <div
              className="status status-success"
              style={{ marginBottom: "8px" }}
            >
              ✅ Approved: Block #{approveResult?.toString()}
            </div>
          )}
          {mintFromICPError ? (
            <div className="status status-error">
              ⚠️ {mintFromICPError.message}
              <button
                className="btn-icon"
                onClick={handleReset}
                style={{ marginLeft: "auto", fontSize: "0.75rem" }}
              >
                ✕
              </button>
            </div>
          ) : mintFromICPResult ? (
            <div className="status status-success">
              🎉 Thank you for your donation! Block:{" "}
              {mintFromICPResult.toString()}
              <button
                className="btn-icon"
                onClick={handleReset}
                style={{ marginLeft: "auto", fontSize: "0.75rem" }}
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default Donation
