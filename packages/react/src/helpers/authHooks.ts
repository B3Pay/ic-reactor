import React from "react"
import { useStore } from "zustand"
import type {
  AgentManager,
  UseAuthParameters,
  LogoutParameters,
  LoginParameters,
  AuthHooksReturnType,
  Principal,
  Identity,
  LoginState,
} from "../types"
import {
  IC_INTERNET_IDENTITY_PROVIDER,
  LOCAL_INTERNET_IDENTITY_PROVIDER,
} from "@ic-reactor/core/dist/utils"

export const authHooks = (agentManager: AgentManager): AuthHooksReturnType => {
  const {
    authenticate: authenticator,
    getAuth,
    authStore,
    isLocalEnv,
  } = agentManager

  const useAuthState = () => useStore(authStore)

  const useUserPrincipal = () => useAuthState()?.identity?.getPrincipal()

  const useAuth = ({
    onAuthentication,
    onAuthenticationSuccess,
    onAuthenticationFailure,
    onLogin,
    onLoginSuccess,
    onLoginError,
    onLoggedOut,
  }: UseAuthParameters = {}) => {
    const [loginState, setLoginState] = React.useState<LoginState>({
      loading: false,
      error: null,
    })
    const { authenticated, authenticating, error, identity } = useAuthState()

    const authenticate = React.useCallback(async () => {
      const authenticatePromise: Promise<Identity> = new Promise(
        (resolve, reject) => {
          authenticator()
            .then((identity) => {
              onAuthenticationSuccess?.(identity)
              resolve(identity)
            })
            .catch((e) => {
              onAuthenticationFailure?.(e as Error)
              reject(e)
            })
        }
      )

      onAuthentication?.(() => authenticatePromise)

      return authenticatePromise
    }, [
      authenticator,
      onAuthentication,
      onAuthenticationSuccess,
      onAuthenticationFailure,
    ])

    const login = React.useCallback(
      async (options?: LoginParameters) => {
        setLoginState({ loading: true, error: null })

        const loginPromise: Promise<Principal> = new Promise(
          (resolve, reject) => {
            try {
              const authClient = getAuth()

              if (!authClient) {
                throw new Error("Auth client not initialized")
              }

              authClient.login({
                identityProvider: isLocalEnv
                  ? LOCAL_INTERNET_IDENTITY_PROVIDER
                  : IC_INTERNET_IDENTITY_PROVIDER,
                ...options,
                onSuccess: () => {
                  authenticate()
                    .then((identity) => {
                      const principal = identity.getPrincipal()
                      options?.onSuccess?.()
                      onLoginSuccess?.(principal)
                      resolve(principal)
                      setLoginState({ loading: false, error: null })
                    })
                    .catch((e) => {
                      const error = e as Error
                      setLoginState({ loading: false, error })
                      onLoginError?.(error)
                      reject(error)
                    })
                },
                onError: (e) => {
                  options?.onError?.(e)
                  const error = new Error("Login failed: " + e)
                  setLoginState({ loading: false, error })
                  onLoginError?.(error)
                  reject(error)
                },
              })
            } catch (e) {
              const error = e as Error
              setLoginState({ loading: false, error })
              onLoginError?.(error)
              reject(error)
            }
          }
        )

        onLogin?.(() => loginPromise)
      },
      [onLogin, onLoginSuccess, onLoginError, isLocalEnv, authenticate]
    )

    const logout = React.useCallback(
      async (options?: LogoutParameters) => {
        const authClient = getAuth()

        if (!authClient) {
          throw new Error("Auth client not initialized")
        }
        await authClient.logout(options)
        await authenticate()
        onLoggedOut?.()
      },
      [onLoggedOut]
    )

    React.useEffect(() => {
      const authClient = getAuth()

      if (!authClient && !authenticating) {
        authenticate()
      }
    }, [authenticating])

    return {
      authenticated,
      authenticating,
      identity,
      error,
      login,
      logout,
      authenticate,
      loginLoading: loginState.loading,
      loginError: loginState.error,
    }
  }

  return {
    useUserPrincipal,
    useAuthState,
    useAuth,
  }
}
