/**
 * App Component - Custom Provider Example
 *
 * A modern ICRC1 Token Viewer with dynamic canister ID support.
 */
import { useRef, useState } from "react"
import { Principal } from "@icp-sdk/core/principal"

import { useUserPrincipal } from "./reactor"
import ICRC1Provider from "./ICRC1Provider"
import ICRC1Call from "./ICRC1Call"
import UserWallet from "./UserWallet"
import Login from "./Login"
import type { ICRC1 } from "./declarations/icrc1"

type FunctionName = keyof ICRC1

const tokenMethods: { name: FunctionName; icon: string; label: string }[] = [
  { name: "icrc1_name", icon: "📛", label: "Token Name" },
  { name: "icrc1_symbol", icon: "🏷️", label: "Symbol" },
  { name: "icrc1_decimals", icon: "🔢", label: "Decimals" },
  { name: "icrc1_fee", icon: "💰", label: "Transfer Fee" },
  { name: "icrc1_total_supply", icon: "📊", label: "Total Supply" },
]

const App = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [canisterId, setCanisterId] = useState<string>(
    "ryjl3-tyaaa-aaaaa-aaaba-cai"
  )

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const principal = Principal.fromText(inputRef.current?.value || "")
      setCanisterId(principal.toText())
    } catch (e) {
      console.error(e)
    }
  }

  const principal = useUserPrincipal()

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">🪙</div>
        <h1 className="app-title">ICRC1 Token Viewer</h1>
        <p className="app-subtitle">
          Explore any ICRC1 token on the Internet Computer
        </p>
      </header>

      {/* Auth Section */}
      <Login />

      {/* Search Form */}
      <form onSubmit={onSubmit} className="search-form">
        <input
          className="input search-input"
          id="canisterId"
          required
          ref={inputRef}
          defaultValue={canisterId}
          placeholder="Enter ICRC1 Canister ID (e.g., ryjl3-tyaaa-aaaaa-aaaba-cai)"
        />
        <button type="submit" className="btn btn-primary">
          🔍 Fetch Token
        </button>
      </form>

      {/* Token Provider */}
      <ICRC1Provider canisterId={canisterId}>
        {/* Token Info Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-icon">📋</span>
            <h2 className="card-title">Token Information</h2>
          </div>
          <div className="token-info-grid">
            {tokenMethods.map(({ name, icon, label }) => (
              <ICRC1Call
                key={name}
                functionName={name}
                icon={icon}
                label={label}
              />
            ))}
          </div>
        </div>

        {/* User Balance & Wallet */}
        {principal && (
          <div className="card">
            <div className="card-header">
              <span className="card-icon">💼</span>
              <h2 className="card-title">Your Wallet</h2>
            </div>
            <ICRC1Call
              functionName="icrc1_balance_of"
              args={[{ owner: principal, subaccount: [] }]}
              icon="💎"
              label="Your Balance"
              isBalance
            />
            <UserWallet principal={principal} />
          </div>
        )}

        {/* Not Authenticated Message */}
        {!principal && (
          <div className="card text-center">
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔐</div>
            <p className="text-muted">
              Connect with Internet Identity to view your balance and make
              transfers
            </p>
          </div>
        )}
      </ICRC1Provider>

      {/* Footer */}
      <footer className="text-center mt-md">
        <p className="text-muted" style={{ fontSize: "0.85rem" }}>
          Powered by{" "}
          <a
            href="https://github.com/AstroX-Labs/ic-reactor"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary"
            style={{ textDecoration: "none" }}
          >
            IC Reactor v3
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
