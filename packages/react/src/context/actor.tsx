import React, {
  createContext,
  PropsWithChildren,
  useMemo,
  useContext,
} from "react"
import { createReActor } from "../index"
import { IDL } from "@dfinity/candid"
import {
  ActorSubclass,
  ActorManagerOptions,
  FunctionType,
  DefaultActorType,
} from "@ic-reactor/store"
import { AgentContextType, useAgentManager } from "./agent"
import {
  ActorDefaultHooks,
  ActorHooks,
  ActorHooksWithDetails,
  ActorHooksWithField,
  ActorUseMethodArg,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
  GetFunctions,
} from "../types"
import useIDLFactory from "../hooks/useIDLFactory"

export type ActorContextType<A = ActorSubclass<any>> = ActorHooks<A, true, true>

export interface ActorContextReturnType<
  A extends ActorSubclass<any> = DefaultActorType
> extends GetFunctions<A> {
  useActor: <
    A extends ActorSubclass<any> = DefaultActorType
  >() => ActorContextType<A>
  ActorProvider: React.FC<ActorProviderProps>
}

export type CreateReActorContext = {
  // When both withServiceFields and withServiceDetails are true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields: true
      withServiceDetails: true
    }
  ): ActorHooksWithField<A> &
    ActorHooksWithDetails<A> &
    ActorContextReturnType<A>

  // When withServiceFields is true and withServiceDetails is false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields: true
      withServiceDetails?: false | undefined
    }
  ): ActorHooksWithField<A> & ActorContextReturnType<A>

  // When withServiceFields is false or undefined and withServiceDetails is true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
      withServiceDetails: true
    }
  ): ActorHooksWithDetails<A> & ActorContextReturnType<A>

  // When both withServiceFields and withServiceDetails are false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
      withServiceDetails?: false | undefined
    }
  ): ActorDefaultHooks<A, false> & ActorContextReturnType<A>
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
        console.log("Creating actor", { withServiceFields, withServiceDetails })
        return createReActor<any>({
          idlFactory,
          agentManager,
          canisterId,
          withDevtools: config.withDevtools,
          withServiceFields: withServiceFields as true,
          withServiceDetails: withServiceDetails as true,
        })
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
    args: ActorUseMethodArg<Actor, T> & { type: T }
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
