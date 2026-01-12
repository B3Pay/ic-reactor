import { generateKey } from "@ic-reactor/core"
import { useRef } from "react"
import {
  balanceQuery,
  allowanceQuery,
  approveMutation,
  retrieveBtcMutation,
  CKBTC_MINTER_CANISTER_ID,
} from "./reactor"
import { formatBalance } from "./util"

interface MinterRetrieveBTCProps {
  userPrincipal: string
}

const MinterRetrieveBTC: React.FC<MinterRetrieveBTCProps> = ({
  userPrincipal,
}) => {
  const addressRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  // Balance query
  const {
    data: balance,
    refetch: refetchBalance,
    isLoading: balanceLoading,
  } = balanceQuery([{ owner: userPrincipal }]).useQuery()

  // Allowance query
  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: allowanceLoading,
  } = allowanceQuery([
    {
      account: { owner: userPrincipal },
      spender: { owner: CKBTC_MINTER_CANISTER_ID },
    },
  ]).useQuery()

  // Retrieve BTC mutation
  const {
    mutate: retrieveBtc,
    data: retrieveBtcResult,
    error: retrieveBtcError,
    isPending: retrieveBtcLoading,
    reset: resetRetrieve,
  } = retrieveBtcMutation.useMutation({
    onSuccess: () => {
      refetchBalance()
      refetchAllowance()
    },
  })

  // Approve mutation
  const {
    mutate: approve,
    isPending: approveLoading,
    data: approveResult,
    reset: resetApprove,
  } = approveMutation.useMutation({
    onSuccess: () => {
      refetchAllowance()

      const amount = amountRef.current?.value || "0"
      const address = addressRef.current?.value || ""
      retrieveBtc([{ amount, address }])
    },
  })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const amount = amountRef.current?.value || "0"
    approve([
      {
        spender: { owner: CKBTC_MINTER_CANISTER_ID },
        amount,
      },
    ])
  }

  const isProcessing = approveLoading || retrieveBtcLoading

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">⬆️</span>
        <h3 className="card-title">Withdraw to BTC</h3>
      </div>

      {/* Balance & Allowance Display */}
      <div style={{ marginBottom: "16px" }}>
        <div className="data-row">
          <span className="data-label">ckBTC Balance</span>
          <span className="data-value">
            {balanceLoading ? (
              <span className="spinner" />
            ) : (
              <>
                {formatBalance(balance)} ckBTC
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
          <span className="data-label">Minter Allowance</span>
          <span className="data-value">
            {allowanceLoading ? (
              <span className="spinner" />
            ) : (
              <>
                {allowance ? formatBalance(allowance.allowance) : "0"} ckBTC
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

      {/* Retrieve Form */}
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label">BTC Address</label>
          <input ref={addressRef} type="text" placeholder="bc1q..." required />
        </div>

        <div className="form-group">
          <label className="form-label">Amount (satoshis)</label>
          <input ref={amountRef} type="text" placeholder="100000" required />
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
          ) : retrieveBtcLoading ? (
            <>
              <span className="spinner" style={{ marginRight: "8px" }} />
              Retrieving BTC...
            </>
          ) : (
            "Withdraw to BTC"
          )}
        </button>
      </form>

      {/* Result Display */}
      {(approveResult || retrieveBtcResult || retrieveBtcError) && (
        <div style={{ marginTop: "16px" }}>
          {approveResult && (
            <div
              className="status status-success"
              style={{ marginBottom: "8px" }}
            >
              ✅ Approved: Block #{approveResult.toString()}
            </div>
          )}
          {retrieveBtcError ? (
            <div className="status status-error">
              ⚠️ {retrieveBtcError.message}
              <button
                className="btn-icon"
                onClick={() => {
                  resetApprove()
                  resetRetrieve()
                }}
                style={{ marginLeft: "auto", fontSize: "0.75rem" }}
              >
                ✕
              </button>
            </div>
          ) : retrieveBtcResult ? (
            <div className="status status-success">
              ✅ BTC withdrawal initiated! {generateKey([retrieveBtcResult])}
              <button
                className="btn-icon"
                onClick={() => {
                  resetApprove()
                  resetRetrieve()
                }}
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

export default MinterRetrieveBTC
