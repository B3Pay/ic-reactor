import { useAuth } from "@ic-reactor/react"

interface LoginProps {}

const Login: React.FC<LoginProps> = () => {
  const {
    login,
    logout,
    loginLoading,
    loginError,
    identity,
    authenticating,
    authenticated
  } = useAuth()

  return (
    <>
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
          <button onClick={() => login()} disabled={authenticating}>
            Login
          </button>
        </div>
      )}
    </>
  )
}

export default Login
