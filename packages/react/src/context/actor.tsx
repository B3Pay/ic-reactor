import React, {
  createContext,
  PropsWithChildren,
  useMemo,
  useContext,
} from "react"
import { IDL } from "@dfinity/candid"
import {
  ActorSubclass,
  ActorManagerOptions,
  FunctionType,
  DefaultActorType,
  createReActorStore,
} from "@ic-reactor/store"
import { AgentContextType, useAgentManager } from "./agent"
import {
  ActorHooks,
  ActorUseMethodCallArg,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
} from "../types"
import useIDLFactory from "../hooks/useIDLFactory"
import { getActorHooks } from "../hooks/actor"

export type ActorContextType<
  Actor = ActorSubclass<any>,
  F extends boolean = true,
  D extends boolean = true
> = ActorHooks<Actor, F, D> & {
  useActor: <A extends ActorSubclass<any> = Actor>() => ActorContextType<
    A,
    F,
    D
  >
  ActorProvider: React.FC<
    ActorProviderProps & {
      withServiceFields?: F
      withServiceDetails?: D
    }
  >
}

export type CreateReActorContext = {
  // When both withServiceFields and withServiceDetails are true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields: true
      withServiceDetails: true
    }
  ): ActorContextType<A, true, true>

  // When withServiceFields is true and withServiceDetails is false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields: true
      withServiceDetails?: false | undefined
    }
  ): ActorContextType<A, true, false>

  // When withServiceFields is false or undefined and withServiceDetails is true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
      withServiceDetails: true
    }
  ): ActorContextType<A, false, true>

  // When both withServiceFields and withServiceDetails are false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
      withServiceDetails?: false | undefined
    }
  ): ActorContextType<A, false, false>
}

export interface CreateActorOptions
  extends Omit<
    ActorManagerOptions,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  didjsId?: string
  canisterId?: string
  agentContext?: AgentContextType
  idlFactory?: IDL.InterfaceFactory
  loadingComponent?: React.ReactNode
}

export interface ActorProviderProps
  extends PropsWithChildren,
    CreateActorOptions {
  loadingComponent?: React.ReactNode
}

export const createReActorContext: CreateReActorContext = <
  Actor extends ActorSubclass<any>
>({
  didjsId,
  canisterId: defaultCanisterId,
  agentContext: defaultAgentContext,
  withServiceFields: defaultWithServiceFields = false,
  withServiceDetails: defaultWithServiceDetails = false,
  ...defaultConfig
}: Partial<CreateActorOptions> = {}) => {
  const ActorContext = createContext<ActorContextType | null>(null)

  const ActorProvider: React.FC<ActorProviderProps> = ({
    children,
    canisterId = defaultCanisterId,
    agentContext = defaultAgentContext,
    loadingComponent = <div>Fetching canister...</div>,
    withServiceFields = defaultWithServiceFields,
    withServiceDetails = defaultWithServiceDetails,
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
    const { idlFactory, fetching, fetchError } = useIDLFactory(
      canisterId,
      didjsId,
      config.idlFactory
    )

    const agentManager = useAgentManager(agentContext)

    const hooks = useMemo(() => {
      if (!idlFactory) {
        return null
      }
      try {
        const actorManager = createReActorStore({
          idlFactory,
          agentManager,
          canisterId,
          withDevtools: config.withDevtools,
          withServiceFields,
          withServiceDetails,
        })

        return getActorHooks(actorManager) as ActorContextType
      } catch (err) {
        console.error(err)
        return null
      }
    }, [canisterId, agentManager, idlFactory])

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
  ) => useActor().useQueryCall(args)

  const useUpdateCall = <M extends keyof Actor & string>(
    args: ActorUseUpdateArgs<Actor, M>
  ) => useActor().useUpdateCall(args)

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
