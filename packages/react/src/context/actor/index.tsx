/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useMemo, useContext } from "react"
import {
  ActorUseMethodCallArg,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
} from "../../types"
import { getActorHooks } from "../../helpers/actor"
import {
  CreateActorOptions,
  ActorContextType,
  ActorProviderProps,
} from "./types"
import { useActor } from "../../hooks/useActor"
import type { ActorSubclass } from "@dfinity/agent"

export const {
  ActorContext,
  ActorProvider,
  useActorContext,
  useActorState,
  useQueryCall,
  useUpdateCall,
  useMethodCall,
  useVisitMethod,
} = createReactorContext()

export function createReactorContext<Actor extends ActorSubclass<any>>({
  canisterId: defaultCanisterId,
  ...defaultConfig
}: Partial<CreateActorOptions> = {}) {
  const ActorContext = createContext<ActorContextType | null>(null)

  const ActorProvider: React.FC<ActorProviderProps> = ({
    children,
    canisterId = defaultCanisterId,
    loadingComponent = <div>Fetching canister...</div>,
    ...restConfig
  }) => {
    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    const config = useMemo(
      () => ({
        ...defaultConfig,
        ...restConfig,
      }),
      [defaultConfig, restConfig]
    )

    const { actorManager, fetchError, fetching } = useActor({
      canisterId,
      ...config,
    })

    const hooks = useMemo(() => {
      if (actorManager) {
        return getActorHooks(actorManager) as ActorContextType
      }
      return null
    }, [actorManager?.canisterId])

    return (
      <ActorContext.Provider value={hooks}>
        {fetching || hooks === null ? fetchError ?? loadingComponent : children}
      </ActorContext.Provider>
    )
  }

  ActorProvider.displayName = "ActorProvider"

  const useActorContext = <A extends ActorSubclass<any> = Actor>() => {
    const context = useContext(ActorContext) as ActorContextType<A>

    if (!context) {
      throw new Error("useActor must be used within a ActorProvider")
    }

    return context
  }

  const initialize = () => useActorContext().initialize()

  const useActorState = () => useActorContext().useActorState()

  const useQueryCall = <M extends keyof Actor & string>(
    args: ActorUseQueryArgs<Actor, M>
  ) => useActorContext().useQueryCall(args)

  const useUpdateCall = <M extends keyof Actor & string>(
    args: ActorUseUpdateArgs<Actor, M>
  ) => useActorContext().useUpdateCall(args)

  const useMethodCall = <M extends keyof Actor & string>(
    args: ActorUseMethodCallArg<Actor, M>
  ) => useActorContext().useMethodCall(args)

  const useVisitMethod = (functionName: keyof Actor & string) =>
    useActorContext().useVisitMethod(functionName)

  return {
    ActorContext,
    ActorProvider,
    useActorContext,
    useActorState,
    useQueryCall,
    useUpdateCall,
    useMethodCall,
    useVisitMethod,
    initialize,
  }
}
