import type { HttpAgent } from "@dfinity/agent"
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

const defaultCreateReActorOptions: ReActorOptions = {
  initializeOnMount: true,
  host:
    process?.env.NODE_ENV === "production" || process?.env.DFX_NETWORK === "ic"
      ? "https://icp-api.io"
      : "http://localhost:4943",
}

export const createReActor = <A extends ActorSubclass<any>>(
  actorInitializer: (agent: HttpAgent) => A,
  options: ReActorOptions = {}
) => {
  const optionsWithDefaults = {
    ...defaultCreateReActorOptions,
    ...options,
  }

  const { callMethod, authenticate, authStore, actorStore } =
    createReActorStore<A>(
      (agent) => actorInitializer(agent),
      optionsWithDefaults
    )

  const useActorStore = () => {
    const actorState = useStore(actorStore, (state) => state)
    return actorState
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
