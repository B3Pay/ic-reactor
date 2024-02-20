import React, { createContext, useMemo, useContext } from "react"
import {
  BaseActor,
  FunctionName,
  UseMethodCallArg,
  UseQueryCallArgs,
  UseUpdateCallArgs,
} from "../../types"
import { getActorHooks } from "../../helpers/actor"
import {
  CreateActorOptions,
  ActorContextType,
  ActorProviderProps,
} from "./types"
import { useReactor } from "../../hooks/useReactor"

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

export function createReactorContext<Actor = BaseActor>({
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

    const { actorManager, fetchError, fetching } = useReactor({
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

  const useActorContext = () => {
    const context = useContext(ActorContext) as ActorContextType<Actor> | null

    if (!context) {
      throw new Error("useActor must be used within a ActorProvider")
    }

    return context
  }

  const initialize = () => useActorContext().initialize()

  const useActorState = () => useActorContext().useActorState()

  const useQueryCall = <M extends FunctionName<Actor>>(
    args: UseQueryCallArgs<Actor, M>
  ) => useActorContext().useQueryCall(args)

  const useUpdateCall = <M extends FunctionName<Actor>>(
    args: UseUpdateCallArgs<Actor, M>
  ) => useActorContext().useUpdateCall(args)

  const useMethodCall = <M extends FunctionName<Actor>>(
    args: UseMethodCallArg<Actor, M>
  ) => useActorContext().useMethodCall(args)

  const useVisitMethod = (functionName: FunctionName<Actor>) =>
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
