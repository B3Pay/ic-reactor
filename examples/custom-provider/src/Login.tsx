/**
 * Login Component
 *
 * Handles authentication with Internet Identity.
 */
import { useAuth } from "./reactor"

const Login = () => {
  const { login, logout, isAuthenticating, error, identity, isAuthenticated } =
    useAuth()

  return (
    <div className="auth-section">
      <div className="auth-info">
        <span className="auth-icon">{isAuthenticated ? "🔓" : "🔐"}</span>
        <div>
          {isAuthenticated ? (
            <>
              <div className="auth-status">Connected</div>
              <div className="auth-principal">
                {identity?.getPrincipal().toText()}
              </div>
            </>
          ) : (
            <div className="auth-status">Not connected</div>
          )}
          {error && <div className="text-error">{error.message}</div>}
        </div>
      </div>
      {isAuthenticated ? (
        <button className="btn btn-danger" onClick={() => logout()}>
          Logout
        </button>
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => login()}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? (
            <>
              <span className="spinner" />
              Connecting...
            </>
          ) : (
            "🔑 Login with II"
          )}
        </button>
      )}
    </div>
  )
}

export default Login
