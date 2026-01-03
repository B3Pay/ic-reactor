import { Principal } from "@icp-sdk/core/principal"
import { generateKey } from "@ic-reactor/core"
import { updateBalanceMutation } from "./reactor"

type MinterUpdateBalanceProps = React.PropsWithChildren<{
  userPrincipal: Principal
}>

const MinterUpdateBalance: React.FC<MinterUpdateBalanceProps> = ({
  children,
  userPrincipal,
}) => {
  const { mutate, data, isPending, error, reset } =
    updateBalanceMutation.useMutation()

  const handleUpdateBalance = () => {
    mutate([{ owner: userPrincipal.toString() }])
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-icon">🔄</span>
          <h3 className="card-title">Update Balance</h3>
          <button
            className="btn-primary"
            onClick={handleUpdateBalance}
            disabled={isPending}
            style={{ marginLeft: "auto", padding: "8px 16px" }}
          >
            {isPending ? (
              <>
                <span className="spinner" style={{ marginRight: "8px" }} />
                Checking...
              </>
            ) : (
              "Check for New Deposits"
            )}
          </button>
        </div>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
            marginBottom: "12px",
          }}
        >
          Check if any BTC deposits have been confirmed and mint ckBTC
        </p>

        {/* Result Display */}
        {(data || error) && (
          <div style={{ marginTop: "8px" }}>
            {error ? (
              <div className="status status-error">⚠️ {error.message}</div>
            ) : data && data.length > 0 ? (
              <div className="status status-success">
                <div style={{ flex: 1 }}>
                  ✅ Found {data.length} UTXO{data.length > 1 ? "s" : ""}!
                  <pre
                    style={{
                      marginTop: "8px",
                      fontSize: "0.75rem",
                      opacity: 0.8,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {generateKey(data)}
                  </pre>
                </div>
                <button
                  className="btn-icon"
                  onClick={() => reset()}
                  style={{ fontSize: "0.75rem" }}
                >
                  ✕
                </button>
              </div>
            ) : data ? (
              <div className="status status-loading">
                ℹ️ No new UTXOs found. Your deposits may still be confirming.
                <button
                  className="btn-icon"
                  onClick={() => reset()}
                  style={{ marginLeft: "auto", fontSize: "0.75rem" }}
                >
                  ✕
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {children}
    </>
  )
}

export default MinterUpdateBalance
