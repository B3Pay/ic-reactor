import { useAuthClient } from "store"

const Login = () => {
  const {
    login,
    logout,
    loginLoading,
    loginError,
    identity,
    authenticating,
    authenticated,
  } = useAuthClient({
    onAuthentication(authPromise) {
      console.log("🚀 ~ onAuthentication ~ Authenticating...")
      authPromise()
        .then((identity) => {
          console.log(
            "🚀 ~ onAuthentication ~ Authenticated as:",
            identity.getPrincipal().toText()
          )
        })
        .catch((error) => {
          console.log("🚀 ~ onAuthentication ~ error:", error)
        })
    },
    onLogin(loginPromise) {
      console.log("🚀 ~ onLogin ~ Logging in...")
      loginPromise()
        .then((principal) => {
          console.log("🚀 ~ onLogin ~ Logged in as:", principal.toText())
        })
        .catch((error) => {
          console.log("🚀 ~ onLogin ~ error:", error)
        })
    },
    onLoggedOut() {
      console.log("🚀 ~ onLoggedOut ~ Logged out!")
    },
    onAuthenticationSuccess(identity) {
      console.log(
        "🚀 ~ onAuthenticationSuccess ~ identity:",
        identity.getPrincipal().toText()
      )
    },
    onAuthenticationFailure(error) {
      console.log("🚀 ~ onAuthenticationFailure ~ error:", error)
    },
    onLoginError(error) {
      console.log("🚀 ~ onLoginError ~ error:", error)
    },
    onLoginSuccess(principal) {
      console.log("🚀 ~ onLoginSuccess ~ Logged in as:", principal.toText())
    },
  })

  return (
    <div>
      <h2>Login:</h2>
      <div>
        {loginLoading && <div>Loading...</div>}
        {loginError ? <div>{JSON.stringify(loginError)}</div> : null}
        {identity && <div>{identity.getPrincipal().toText()}</div>}
      </div>
      {authenticated ? (
        <div className="flex flex-col align-center">
          <button onClick={() => logout()}>Logout</button>
        </div>
      ) : (
        <div>
          <button
            onClick={() =>
              login({
                identityProvider: "https://identity.ic0.app/#authorize",
              })
            }
            disabled={authenticating}
          >
            Login
          </button>
        </div>
      )}
    </div>
  )
}

export default Login
