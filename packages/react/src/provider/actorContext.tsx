import React, { createContext, useMemo } from "react"
import { GetActorHooks, BaseActor } from "../types"
import {
  CreateActorContextOptions,
  CreateActorContextReturn,
  ActorProviderProps,
} from "./types"
import { useActor } from "./hooks/useActor"
import { extractActorContext } from "../helpers/extractActorContext"

export function createActorContext<A = BaseActor>(
  reactorOptions: Partial<CreateActorContextOptions> = {}
): CreateActorContextReturn<A> {
  const { canisterId: defaultCanisterId, ...defaultConfig } = reactorOptions

  const ActorContext = createContext<GetActorHooks<A> | null>(null)

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

    const { fetchError, fetching, hooks } = useActor<A>({
      canisterId,
      ...config,
    })

    return (
      <ActorContext.Provider value={hooks}>
        {fetching || hooks === null ? fetchError ?? loadingComponent : children}
      </ActorContext.Provider>
    )
  }

  ActorProvider.displayName = "ActorProvider"

  return {
    ActorProvider: ActorProvider,
    ...extractActorContext<A>(ActorContext),
  }
}
