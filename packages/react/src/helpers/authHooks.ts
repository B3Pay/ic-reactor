import React from "react"
import { useStore } from "zustand"
import {
  getNetworkByHostname,
  IC_INTERNET_IDENTITY_PROVIDER,
  LOCAL_INTERNET_IDENTITY_PROVIDER,
} from "@ic-reactor/core/dist/utils"

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
import type { InternetIdentityAuthResponseSuccess } from "@dfinity/auth-client"

export const authHooks = (agentManager: AgentManager): AuthHooksReturnType => {
  const {
    authenticate: authenticator,
    getIsLocal,
    getAuth,
    authStore,
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
    const network = React.useRef("ic")

    const [loginState, setLoginState] = React.useState<LoginState>({
      loading: false,
      error: undefined,
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
              onAuthenticationFailure?.(e)
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
        setLoginState({ loading: true, error: undefined })

        const loginPromise: Promise<Principal> = new Promise(
          (resolve, reject) => {
            try {
              const authClient = getAuth()

              if (!authClient) {
                throw new Error("Auth client not initialized")
              }

              authClient.login({
                identityProvider: getIsLocal()
                  ? LOCAL_INTERNET_IDENTITY_PROVIDER
                  : IC_INTERNET_IDENTITY_PROVIDER,
                ...options,
                onSuccess: (msg: InternetIdentityAuthResponseSuccess) => {
                  authenticate()
                    .then((identity) => {
                      const principal = identity.getPrincipal()
                      options?.onSuccess?.(msg)
                      onLoginSuccess?.(principal)
                      resolve(principal)
                      setLoginState({ loading: false, error: undefined })
                    })
                    .catch((error) => {
                      setLoginState({ loading: false, error })
                      onLoginError?.(error)
                      reject(error)
                    })
                },
                onError: (error) => {
                  options?.onError?.(error)
                  setLoginState({ loading: false, error })
                  onLoginError?.(error)
                  reject(error)
                },
              })
            } catch (e) {
              const error = e as string
              setLoginState({ loading: false, error })
              onLoginError?.(error)
              reject(error)
            }
          }
        )

        onLogin?.(() => loginPromise)
      },
      [onLogin, onLoginSuccess, onLoginError, authenticate]
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
      const unsubscribe = agentManager.subscribeAgent((agent) => {
        const agentNetwork = getNetworkByHostname(agent.host.hostname)
        if (network.current !== agentNetwork) {
          network.current = agentNetwork
          authenticate()
        }
      })

      authenticate()

      return unsubscribe
    }, [])

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
