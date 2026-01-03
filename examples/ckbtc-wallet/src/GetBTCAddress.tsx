import { Principal } from "@icp-sdk/core/principal"
import { useState } from "react"
import { btcAddressQuery } from "./reactor"

type GetBTCAddressProps = React.PropsWithChildren<{
  userPrincipal: Principal
}>

const GetBTCAddress: React.FC<GetBTCAddressProps> = ({
  userPrincipal,
  children,
}) => {
  const [copied, setCopied] = useState(false)

  const { data, error, isLoading, refetch } = btcAddressQuery([
    { owner: userPrincipal.toString() },
  ]).useQuery()

  const handleCopy = async () => {
    if (data) {
      await navigator.clipboard.writeText(data)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-icon">📍</span>
          <h3 className="card-title">BTC Deposit Address</h3>
          <button
            className="btn-icon"
            onClick={() => refetch()}
            disabled={isLoading}
            title="Refresh address"
            style={{ marginLeft: "auto" }}
          >
            ↻
          </button>
        </div>

        {isLoading ? (
          <div className="status status-loading">
            <span className="spinner" />
            Fetching your deposit address...
          </div>
        ) : error ? (
          <div className="status status-error">⚠️ {error.message}</div>
        ) : data ? (
          <>
            <p
              style={{
                marginBottom: "8px",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              Send BTC to this address to receive ckBTC:
            </p>
            <div style={{ display: "flex", alignItems: "stretch", gap: "8px" }}>
              <div className="btc-address" style={{ flex: 1 }}>
                {data}
              </div>
              <button
                className="btn-secondary"
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy address"}
                style={{
                  padding: "0px 12px",
                  transition: "all 0.2s ease",
                  background: copied ? "rgba(16, 185, 129, 0.2)" : undefined,
                  borderColor: copied ? "rgba(16, 185, 129, 0.5)" : undefined,
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </>
        ) : null}
      </div>

      {children}
    </>
  )
}

export default GetBTCAddress
