import { AuthClientLoginOptions } from "@dfinity/auth-client"
import type {
  ActorSubclass,
  ReActorAuthStore,
  ReActorOptions,
} from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { useEffect, useState } from "react"
import { useStore } from "zustand"
import { getCallHooks } from "./hooks"

export type ReActorContextType<A = ActorSubclass<any>> = ReActorAuthStore<A>

export const createReActor = <A extends ActorSubclass<any>>(
  options: ReActorOptions
) => {
  const isLocal =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" ||
      process.env.DFX_NETWORK === "local")

  const {
    callMethod,
    unsubscribe,
    initialize,
    authenticate,
    authStore,
    actorStore,
  } = createReActorStore<A>({
    isLocal,
    ...options,
    initializeOnMount: false,
  })

  const useActorStore = () => {
    const actorState = useStore(actorStore, (state) => state)

    useEffect(() => {
      initialize()
      return unsubscribe
    }, [])

    return { ...actorState, initialize }
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

  const { useQueryCall, useUpdateCall } = getCallHooks<A>(callMethod)

  return {
    useActorStore,
    useAuthStore,
    useQueryCall,
    useUpdateCall,
    useAuthClient,
  }
}
