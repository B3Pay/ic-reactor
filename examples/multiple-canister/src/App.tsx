import { useUserPrincipal, useAuth } from "./reactor"
import Donation from "./components/Donation"
import Login from "./Login"
import { ICPName } from "./components/ICPName"
import { ICDVName } from "./components/ICDVName"
import { ICDVStats } from "./components/ICDVStats"
import { MyICDVBalance } from "./components/MyICDVBalance"

const App = () => {
  const { isAuthenticated } = useAuth()
  const principal = useUserPrincipal()

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">💝</div>
        <h1 className="app-title">ICDV Donation</h1>
        <p className="app-subtitle">
          Support Internet Computer development by donating ICP
        </p>
      </header>

      {/* Login Section */}
      <Login />

      {/* Token Info Cards */}
      <div className="token-cards">
        <ICPName />
        <ICDVName />
      </div>

      {/* ICDV Stats */}
      <ICDVStats />

      {/* Donation Form */}
      {isAuthenticated && principal ? (
        <>
          <Donation principal={principal} />
          <MyICDVBalance principal={principal} />
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🔐</div>
          <p className="empty-state-text">
            Connect with Internet Identity to donate
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>
          Powered by{" "}
          <a
            href="https://github.com/AstroX-Labs/ic-reactor"
            target="_blank"
            rel="noopener noreferrer"
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
