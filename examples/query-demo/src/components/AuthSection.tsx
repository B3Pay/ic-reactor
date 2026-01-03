import { styles } from "../styles"
import { useAuth, useUserPrincipal } from "../reactor"

export function AuthSection() {
  const { login, logout, isAuthenticated, isAuthenticating } = useAuth()
  const principal = useUserPrincipal()

  return (
    <div style={styles.authContainer}>
      {isAuthenticated ? (
        <div style={styles.authInfo}>
          <span style={styles.principal}>
            Logged in as: {principal?.toText().slice(0, 10)}...
          </span>
          <button onClick={() => logout()} style={styles.authButton}>
            Logout
          </button>
        </div>
      ) : (
        <button
          onClick={() => login()}
          disabled={isAuthenticating}
          style={styles.authButton}
        >
          {isAuthenticating ? "Connecting..." : "Login with II"}
        </button>
      )}
    </div>
  )
}
