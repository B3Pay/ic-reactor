import React, { createContext, useMemo, useContext } from "react"
import { ActorSubclass, FunctionType } from "@ic-reactor/store"
import {
  ActorUseMethodCallArg,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
} from "../../types"
import { getActorHooks } from "../../hooks/actor"
import { useActorManager } from "../../hooks/useActorManger"
import {
  CreateReActorContext,
  CreateActorOptions,
  ActorContextType,
  ActorProviderProps,
} from "./types"

export * from "./types"

export const createReActorContext: CreateReActorContext = <
  Actor extends ActorSubclass<any>
>({
  canisterId: defaultCanisterId,
  ...defaultConfig
}: Partial<CreateActorOptions> = {}) => {
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

    const { actorManager, fetchError, fetching } = useActorManager({
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

  type UseActorType = <A = ActorSubclass<any>>() => ActorContextType<A>

  const useActor: UseActorType = <A extends ActorSubclass<any> = Actor>() => {
    const context = useContext(ActorContext) as ActorContextType<A>

    if (!context) {
      throw new Error("useActor must be used within a ActorProvider")
    }

    return context
  }

  const useActorStore = () => useActor().useActorStore()

  const useQueryCall = <M extends keyof Actor & string>(
    args: ActorUseQueryArgs<Actor, M>
  ) => useActor().useQueryCall(args as any)

  const useUpdateCall = <M extends keyof Actor & string>(
    args: ActorUseUpdateArgs<Actor, M>
  ) => useActor().useUpdateCall(args as any)

  const useMethodCall = <T extends FunctionType>(
    args: ActorUseMethodCallArg<Actor, T>
  ) => useActor().useMethodCall(args)

  const useServiceFields = () => useActor().useServiceFields()

  const useMethodFields = () => useActor().useMethodFields()

  const useMethodField = (functionName: keyof Actor & string) =>
    useActor().useMethodField(functionName)

  const useServiceDetails = () => useActor().useServiceDetails()

  const useMethodDetails = () => useActor().useMethodDetails()

  const useMethodDetail = (functionName: keyof Actor & string) =>
    useActor().useMethodDetail(functionName)

  return {
    ActorContext,
    ActorProvider,
    useActor,
    useActorStore,
    useQueryCall,
    useUpdateCall,
    useMethodCall,
    useServiceFields,
    useMethodFields,
    useMethodField,
    useServiceDetails,
    useMethodDetails,
    useMethodDetail,
  } as any
}

export const {
  ActorContext,
  ActorProvider,
  useActor,
  useActorStore,
  useQueryCall,
  useUpdateCall,
  useMethodCall,
  useServiceFields,
  useMethodFields,
  useMethodField,
  useServiceDetails,
  useMethodDetails,
  useMethodDetail,
} = createReActorContext()
