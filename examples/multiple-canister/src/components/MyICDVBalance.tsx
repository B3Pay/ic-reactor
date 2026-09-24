import { formatTokenAmount } from "@ic-reactor/react"
import { Principal } from "@icp-sdk/core/principal"
import { icdvBalanceQuery } from "../reactor"

interface MyICDVBalanceProps {
  principal: Principal
}

export const MyICDVBalance = ({ principal }: MyICDVBalanceProps) => {
  const {
    data: balance,
    isLoading,
    refetch,
  } = icdvBalanceQuery([{ owner: principal, subaccount: [] }]).useQuery()

  // ICDV has 8 decimals. Four places, cut rather than rounded up.
  const formatBalance = (bal: bigint | undefined) => {
    if (bal === undefined) return "—"
    return formatTokenAmount(bal, 8, {
      minFractionDigits: 4,
      maxFractionDigits: 4,
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-icon">💰</span>
        <h3 className="card-title">Your ICDV Balance</h3>
        <button
          className="btn-icon"
          onClick={() => refetch()}
          disabled={isLoading}
          title="Refresh"
          style={{ marginLeft: "auto" }}
        >
          ↻
        </button>
      </div>

      <div style={{ textAlign: "center", padding: "24px" }}>
        {isLoading ? (
          <span className="spinner" />
        ) : (
          <>
            <div
              style={{
                fontSize: "2.5rem",
                fontWeight: "700",
                color: "var(--color-primary)",
              }}
            >
              {formatBalance(balance)}
            </div>
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              ICDV Tokens
            </div>
          </>
        )}
      </div>
    </div>
  )
}
