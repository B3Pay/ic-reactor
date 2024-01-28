import React, {
  createContext,
  useState,
  useEffect,
  PropsWithChildren,
  useMemo,
  useCallback,
  useContext,
} from "react"
import { createReActor } from "../index"
import { IDL } from "@dfinity/candid"
import {
  ActorSubclass,
  ActorManagerOptions,
  FunctionType,
  DefaultActorType,
  CandidManager,
} from "@ic-reactor/store"
import { AgentContextType, useAgentManager } from "./agent"
import {
  ActorHooksWithField,
  ActorHooksWithoutField,
  ActorUseMethodArg,
  ActorUseQueryArgs,
  ActorUseUpdateArgs,
  GetFunctions,
} from "../types"

export type ActorContextType<A = ActorSubclass<any>> = ActorHooksWithField<A>

export interface ActorContextReturnType<
  A extends ActorSubclass<any> = DefaultActorType
> extends GetFunctions<A> {
  useActor: <
    A extends ActorSubclass<any> = DefaultActorType
  >() => ActorContextType<A>
  ActorProvider: React.FC<ActorProviderProps>
}

export type CreateReActorContext = {
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & { withServiceFields: true }
  ): ActorHooksWithField<A> & ActorContextReturnType<A>
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
    }
  ): ActorHooksWithoutField<A> & ActorContextReturnType<A>
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
  ...defaultConfig
}: Partial<CreateActorOptions> = {}) => {
  const ActorContext = createContext<ActorContextType | null>(null)

  const ActorProvider: React.FC<ActorProviderProps> = ({
    children,
    canisterId = defaultCanisterId,
    agentContext = defaultAgentContext,
    loadingComponent = <div>Fetching canister...</div>,
    withServiceFields = defaultWithServiceFields,
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

    const agentManager = useAgentManager(agentContext)

    const [didJs, setDidJS] = useState<{ idlFactory: IDL.InterfaceFactory }>()
    const [fetching, setFetching] = useState(false)
    const [fetchError, setFetchError] = useState<string | null>(null)

    const fetchDidJs = useCallback(async () => {
      setDidJS(undefined)
      setFetching(true)
      setFetchError(null)

      try {
        const agent = agentManager.getAgent()
        const candidManager = new CandidManager(agent, didjsId)

        let idlFactory = await candidManager
          .getFromMetadata(canisterId)
          .catch((err) => {
            console.warn("Error fetching from metadata:", err)
            return null // Return null to indicate failure
          })

        if (!idlFactory) {
          idlFactory = await candidManager
            .getFromTmpHack(canisterId)
            .catch((err) => {
              console.warn("Error fetching from tmp hack:", err)
              return null // Return null to indicate failure
            })
        }

        if (!idlFactory) {
          setFetchError(`Candid not found for canister ${canisterId}`)
        } else {
          setDidJS(idlFactory)
        }
      } catch (err) {
        setFetchError(`Error fetching canister ${canisterId}`)
        console.error(err)
      } finally {
        setFetching(false)
      }
    }, [canisterId, didjsId, agentManager])

    useEffect(() => {
      const { idlFactory } = config

      if (idlFactory) {
        setDidJS({ idlFactory })
        return
      }
      console.log("idlFactory not provided, fetching from canister...")
      fetchDidJs()
    }, [fetchDidJs, config.idlFactory])

    const hooks = useMemo(() => {
      if (!didJs) {
        return null
      }
      try {
        return createReActor<any>({
          idlFactory: didJs.idlFactory,
          agentManager,
          canisterId,
          withDevtools: config.withDevtools,
          withServiceFields: withServiceFields as true,
        })
      } catch (err) {
        console.error(err)
        return null
      }
    }, [canisterId, agentManager, didJs])

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
