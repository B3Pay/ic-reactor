import type { AuthClientLoginOptions } from "@dfinity/auth-client"
import type { Identity, Principal } from "@ic-reactor/core/dist/types"
import type { AgentManager } from "@ic-reactor/core/dist/agent"
import { useCallback, useEffect, useState } from "react"
import { useStore } from "zustand"
import { AuthArgs } from "../types"

export const getAuthHooks = (agentManager: AgentManager) => {
  const { authenticate: authenticator, authStore, isLocalEnv } = agentManager

  const useAuthState = () => {
    return useStore(authStore, (state) => state)
  }

  const useUserPrincipal = () => {
    const { identity } = useAuthState()

    return identity?.getPrincipal()
  }

  const useAuthClient = ({
    onAuthentication,
    onAuthenticationSuccess,
    onAuthenticationFailure,
    onLogin,
    onLoginSuccess,
    onLoginError,
    onLoggedOut,
  }: AuthArgs = {}) => {
    const [loginLoading, setLoginLoading] = useState(false)
    const [loginError, setLoginError] = useState<Error | null>(null)
    const { authClient, authenticated, authenticating, identity } =
      useAuthState()

    const authenticate = useCallback(async () => {
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

    const login = useCallback(
      async (options?: AuthClientLoginOptions) => {
        setLoginLoading(true)
        setLoginError(null)

        const loginPromise: Promise<Principal> = new Promise(
          (resolve, reject) => {
            try {
              if (!authClient) {
                throw new Error("Auth client not initialized")
              }

              authClient.login({
                identityProvider: isLocalEnv
                  ? "https://identity.ic0.app/#authorize"
                  : "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/#authorize",
                ...options,
                onSuccess: () => {
                  authenticate()
                    .then((identity) => {
                      const principal = identity.getPrincipal()
                      options?.onSuccess?.()
                      onLoginSuccess?.(principal)
                      resolve(principal)
                    })
                    .catch((e) => {
                      setLoginError(e as Error)
                      onLoginError?.(e as Error)
                      reject(e)
                    })
                },
                onError: (e) => {
                  options?.onError?.(e)
                  const error = new Error("Login failed: " + e)
                  setLoginError(error)
                  onLoginError?.(error)
                  reject(error)
                },
              })
            } catch (e) {
              setLoginError(e as Error)
              onLoginError?.(e as Error)
              reject(e)
            } finally {
              setLoginLoading(false)
            }
          }
        )

        onLogin?.(() => loginPromise)
      },
      [
        authClient,
        onLogin,
        onLoginSuccess,
        onLoginError,
        isLocalEnv,
        authenticate,
      ]
    )

    const logout = useCallback(
      async (options?: { returnTo?: string }) => {
        if (!authClient) {
          throw new Error("Auth client not initialized")
        }
        await authClient.logout(options)
        await authenticate()
        onLoggedOut?.()
      },
      [authClient, onLoggedOut]
    )

    useEffect(() => {
      if (!authClient && !authenticating) {
        authenticate()
      }
    }, [authClient, authenticating])

    return {
      authClient,
      authenticated,
      authenticating,
      identity,
      login,
      logout,
      authenticate,
      loginLoading,
      loginError,
    }
  }

  return {
    useUserPrincipal,
    useAuthState,
    useAuthClient,
  }
}
