import type { AuthClientLoginOptions } from "@dfinity/auth-client"
import type { AgentManager } from "@ic-reactor/store"
import { useCallback, useEffect, useState } from "react"
import { useStore } from "zustand"
import { AuthArgs } from "../types"

export type AuthHooks = ReturnType<typeof getAuthHooks>

export const getAuthHooks = (agentManager: AgentManager) => {
  const { authenticate: authenticator, authStore, isLocalEnv } = agentManager

  const useAgentManager = () => {
    return agentManager
  }

  const useAuthStore = () => {
    const authState = useStore(authStore, (state) => state)
    return authState
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
    const [loginError, setLoginError] = useState<Error | unknown | null>(null)
    const { authClient, authenticated, authenticating, identity } =
      useAuthStore()

    const authenticate = useCallback(async () => {
      onAuthentication?.()
      authenticator()
        .then((identity) => {
          onAuthenticationSuccess?.(identity)
        })
        .catch((e) => {
          onAuthenticationFailure?.(e)
        })
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
        onLogin?.()

        try {
          if (!authClient) {
            throw new Error("Auth client not initialized")
          }

          await authClient.login({
            identityProvider: isLocalEnv
              ? "https://identity.ic0.app/#authorize"
              : "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/#authorize",
            ...options,
            onSuccess: async () => {
              setLoginLoading(false)
              await authenticate()
              options?.onSuccess?.()
              onLoginSuccess?.()
            },
            onError: (e) => {
              setLoginError(e)
              setLoginLoading(false)
              options?.onError?.(e)
              onLoginError?.(e)
            },
          })
        } catch (e) {
          setLoginLoading(false)
          setLoginError(e)
          onLoginError?.(e)
        }
      },
      [authClient, onLogin, onLoginSuccess, onLoginError, isLocalEnv]
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
    useAgentManager,
    useAuthStore,
    useAuthClient,
  }
}
