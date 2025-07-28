import { useAuth } from "@ic-reactor/react"

const Login = () => {
  const {
    login,
    logout,
    isLoginLoading,
    loginError,
    identity,
    isAuthenticating,
    isAuthenticated,
  } = useAuth()

  return (
    <div>
      <h2>Login:</h2>
      <div>
        {isLoginLoading && <div>Loading...</div>}
        {loginError ? <div>{loginError}</div> : null}
        {identity && <div>{identity.getPrincipal().toText()}</div>}
      </div>
      {isAuthenticated ? (
        <div>
          <button onClick={() => logout()}>Logout</button>
        </div>
      ) : (
        <div>
          <button onClick={() => login()} disabled={isAuthenticating}>
            Login
          </button>
        </div>
      )}
    </div>
  )
}

export default Login
