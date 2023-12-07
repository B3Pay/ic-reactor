import type { HttpAgent, HttpAgentOptions } from "@dfinity/agent"
import { AuthClientLoginOptions } from "@dfinity/auth-client"
import type { ActorSubclass, ReActorStore } from "@ic-reactor/store"
import { createReActorStore } from "@ic-reactor/store"
import { createContext, createElement, useEffect, useState } from "react"
import { getStateHooks } from "./hooks"

export type ReActorContextType<A = ActorSubclass<any>> = ReActorStore<A>

export interface CreateReActorOptions extends HttpAgentOptions {
  initializeOnMount?: boolean
}

const defaultCreateReActorOptions: CreateReActorOptions = {
  initializeOnMount: true,
  host:
    process.env.NODE_ENV === "production" || process.env.DFX_NETWORK === "ic"
      ? "https://icp-api.io"
      : "http://localhost:4943",
}

export const createReActor = <A extends ActorSubclass<any>>(
  actorInitializer: (agent: HttpAgent) => A,
  options: CreateReActorOptions = {}
) => {
  const optionsWithDefaults = {
    ...defaultCreateReActorOptions,
    ...options,
  }

  const Context = createContext<ReActorContextType<A> | undefined>(undefined)

  const { actions, initializeActor, store } = createReActorStore<A>(
    (agent) => actorInitializer(agent),
    optionsWithDefaults
  )

  if (optionsWithDefaults.initializeOnMount) {
    try {
      initializeActor()
    } catch (e) {
      console.error(e)
    }
  }

  const ReActorProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => {
    useEffect(() => actions.resetState, [actions.resetState])

    return createElement(Context.Provider, { value: store }, children)
  }

  const {
    useReActor,
    useLoading,
    useError,
    useQueryCall,
    useUpdateCall,
    useInitialized,
    useInitializing,
    useActorState,
  } = getStateHooks<A>(store, actions.callMethod)

  const useAuthClient = () => {
    const [loginLoading, setLoginLoading] = useState(false)
    const [loginError, setLoginError] = useState<Error | unknown | null>(null)
    const { authClient, authenticated, authenticating, identity } = useReActor()

    const authenticate = async () => {
      await actions.authenticate()
    }

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

  return {
    ReActorProvider,
    ...actions,
    useReActor,
    useLoading,
    useError,
    useQueryCall,
    useUpdateCall,
    useAuthClient,
    useActorState,
    useInitialized,
    useInitializing,
  }
}
