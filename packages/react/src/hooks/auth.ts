import type { AuthClientLoginOptions } from "@dfinity/auth-client"
import type { AgentManager } from "@ic-reactor/store"
import { useEffect, useState } from "react"
import { useStore } from "zustand"

export type AuthHooks = ReturnType<typeof getAuthHooks>

export const getAuthHooks = (agentManager: AgentManager) => {
  const { authenticate, authStore, isLocalEnv } = agentManager

  const useAgentManager = () => {
    return agentManager
  }

  const useAuthStore = () => {
    const authState = useStore(authStore, (state) => state)
    return authState
  }

  const useAuthClient = () => {
    const [loginLoading, setLoginLoading] = useState(false)
    const [loginError, setLoginError] = useState<Error | unknown | null>(null)
    const { authClient, authenticated, authenticating, identity } =
      useAuthStore()

    const login = async (options?: AuthClientLoginOptions) => {
      setLoginLoading(true)
      setLoginError(null)

      try {
        await authClient?.login({
          identityProvider: isLocalEnv
            ? "https://identity.ic0.app/#authorize"
            : "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/#authorize",
          ...options,
          onSuccess: async () => {
            setLoginLoading(false)
            await authenticate()
            options?.onSuccess?.()
          },
          onError: (e) => {
            setLoginError(e)
            setLoginLoading(false)
            options?.onError?.(e)
          },
        })
      } catch (e) {
        setLoginLoading(false)
        setLoginError(e)
      }
    }

    const logout = async (options?: { returnTo?: string }) => {
      await authClient?.logout(options)
      await authenticate()
    }

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
