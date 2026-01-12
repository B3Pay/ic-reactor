import { useAuth, useCkbtcLedgerQuery, useUserPrincipal } from "./reactor"
import Login from "./Login"
import GetBTCAddress from "./GetBTCAddress"
import CkbtcUpdateBalance from "./MinterUpdateBalance"
import MinterRetrieveBTC from "./MinterRetrieveBtc"
import CKBTCTransfer from "./CKBTCTransfer"

const App = () => {
  const { isAuthenticated } = useAuth()
  const userPrincipal = useUserPrincipal()

  const { data: name, isLoading: nameLoading } = useCkbtcLedgerQuery({
    functionName: "icrc1_name",
  })

  const { data: symbol } = useCkbtcLedgerQuery({
    functionName: "icrc1_symbol",
  })

  const { data: decimals } = useCkbtcLedgerQuery({
    functionName: "icrc1_decimals",
  })

  const { data: fee } = useCkbtcLedgerQuery({
    functionName: "icrc1_fee",
  })

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">₿</div>
        <h1 className="app-title">
          {nameLoading ? "Loading..." : name || "ckBTC"} Wallet
        </h1>
        <div className="app-subtitle">
          <span className="badge badge-testnet">⚡ Testnet</span>
        </div>
        {symbol && (
          <div className="token-info">
            <div className="token-stat">
              <span className="token-stat-value">{symbol}</span>
              <span className="token-stat-label">Symbol</span>
            </div>
            <div className="token-stat">
              <span className="token-stat-value">{decimals}</span>
              <span className="token-stat-label">Decimals</span>
            </div>
            <div className="token-stat">
              <span className="token-stat-value">
                {fee ? (Number(fee) / 10 ** (decimals || 8)).toFixed(8) : "—"}
              </span>
              <span className="token-stat-label">Fee</span>
            </div>
          </div>
        )}
      </header>

      {/* Login Section */}
      <Login />

      {/* Main Content */}
      {isAuthenticated && userPrincipal ? (
        <div className="wallet-content">
          <GetBTCAddress userPrincipal={userPrincipal.toString()} />
          <CkbtcUpdateBalance userPrincipal={userPrincipal.toString()} />
          <MinterRetrieveBTC userPrincipal={userPrincipal.toString()} />
          <CKBTCTransfer />
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🔐</div>
          <p className="empty-state-text">
            Connect with Internet Identity to access your wallet
          </p>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          marginTop: "48px",
          color: "var(--text-muted)",
          fontSize: "0.75rem",
        }}
      >
        <p>
          Powered by{" "}
          <a
            href="https://github.com/b3pay/ic-reactor"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-primary)" }}
          >
            IC Reactor
          </a>{" "}
          · Built on the Internet Computer
        </p>
      </footer>
    </div>
  )
}

export default App
