import type { AuthClientLoginOptions } from "@dfinity/auth-client"
import type { ActorSubclass, CreateReActorConfig } from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { useEffect, useState } from "react"
import { useStore } from "zustand"
import { getCallHooks } from "./hooks"

export * from "./context"

export const createReActor = <A extends ActorSubclass<any>>(
  options: CreateReActorConfig
) => {
  const isLocal =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" ||
      process.env.DFX_NETWORK === "local")

  const { actorManager, agentManager } = createReActorStore<A>({
    isLocal,
    ...options,
  })

  const { callMethod, actorStore } = actorManager
  const { authenticate, authStore } = agentManager

  const useActorStore = () => {
    const actorState = useStore(actorStore, (state) => state)

    return { ...actorState }
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

  const { useQueryCall, useMethodField, useMethodFields, useUpdateCall } =
    getCallHooks<A>(callMethod, actorStore)

  return {
    useMethodFields,
    useMethodField,
    useActorStore,
    useAuthStore,
    useQueryCall,
    useUpdateCall,
    useAuthClient,
  }
}
