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
  } = useAuthClient()

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
