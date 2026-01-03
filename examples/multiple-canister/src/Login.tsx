import { useAuth } from "./reactor"

const Login = () => {
  const { login, logout, identity, isAuthenticating, isAuthenticated, error } =
    useAuth()

  return (
    <div className="login-section">
      {error && (
        <div className="status status-error" style={{ marginBottom: "16px" }}>
          ⚠️ {error.message}
        </div>
      )}

      {isAuthenticated && identity ? (
        <>
          <div className="user-info">
            <div className="user-avatar">👤</div>
            <div className="user-principal">
              {identity.getPrincipal().toText()}
            </div>
          </div>
          <button className="btn-secondary" onClick={() => logout()}>
            Disconnect Wallet
          </button>
        </>
      ) : (
        <>
          <h2 className="login-title">Connect Your Wallet</h2>
          <p className="login-description">
            Sign in with Internet Identity to donate ICP
          </p>
          <button
            className="btn-primary"
            onClick={() => login()}
            disabled={isAuthenticating}
            style={{ padding: "12px 32px", fontSize: "1rem" }}
          >
            {isAuthenticating ? (
              <>
                <span className="spinner" style={{ marginRight: "8px" }} />
                Connecting...
              </>
            ) : (
              "🔑 Connect with Internet Identity"
            )}
          </button>
        </>
      )}
    </div>
  )
}

export default Login
