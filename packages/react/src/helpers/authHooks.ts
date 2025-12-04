import React from "react"
import { useStore } from "zustand"
import {
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
import type { InternetIdentityAuthResponseSuccess } from "@icp-sdk/auth/client"

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
    const [loginState, setLoginState] = React.useState<LoginState>({
      loading: false,
      isLoading: false,
      error: undefined,
    })
    const { isAuthenticated, isAuthenticating, error, identity } =
      useAuthState()

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
        setLoginState({ loading: true, isLoading: true, error: undefined })

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
                      setLoginState({
                        loading: false,
                        isLoading: false,
                        error: undefined,
                      })
                    })
                    .catch((error) => {
                      setLoginState({ loading: false, isLoading: false, error })
                      onLoginError?.(error)
                      reject(error)
                    })
                },
                onError: (error) => {
                  options?.onError?.(error)
                  setLoginState({ loading: false, isLoading: false, error })
                  onLoginError?.(error)
                  reject(error)
                },
              })
            } catch (e) {
              const error = e as string
              setLoginState({ loading: false, isLoading: false, error })
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

    return {
      isAuthenticated,
      isAuthenticating,
      authenticated: isAuthenticated,
      authenticating: isAuthenticating,
      identity,
      error,
      login,
      logout,
      authenticate,
      loginLoading: loginState.isLoading,
      isLoginLoading: loginState.isLoading,
      loginError: loginState.error,
    }
  }

  return {
    useUserPrincipal,
    useAuthState,
    useAuth,
  }
}
