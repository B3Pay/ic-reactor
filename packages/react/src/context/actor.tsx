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
  getDidJsFromMetadata,
  getDidJsFromTmpHack,
} from "@ic-reactor/store"
import { AgentContextType, useAgentManager } from "./agent"
import { ActorHooksWithField } from "../types"

// Update this to reflect the correct ActorHooks type based on withServiceFields
export type ActorContextType<A = ActorSubclass<any>> = ActorHooksWithField<A>

export const ActorContext = createContext<ActorContextType | null>(null)

type UseActorType = <A = ActorSubclass<any>>() => ActorContextType<A>

export const useActor: UseActorType = <A extends ActorSubclass<any>>() => {
  const context = useContext(ActorContext) as ActorContextType<A>

  if (!context) {
    throw new Error("useActor must be used within a ActorProvider")
  }

  return context
}

interface ActorProviderProps
  extends PropsWithChildren,
    Omit<ActorManagerOptions, "idlFactory" | "agentManager"> {
  agentContext?: AgentContextType
  idlFactory?: IDL.InterfaceFactory
  loadingComponent?: React.ReactNode
}

export const ActorProvider: React.FC<ActorProviderProps> = ({
  children,
  canisterId,
  agentContext,
  loadingComponent = <div>Loading...</div>,
  withServiceFields = false,
  ...config
}) => {
  const agentManager = useAgentManager(agentContext)

  const [didJs, setDidJS] = useState<{ idlFactory: IDL.InterfaceFactory }>()
  const [fetching, setFetching] = useState(false)

  const fetchDidJs = useCallback(async () => {
    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    if (fetching) {
      return
    }

    setFetching(true)

    const agent = agentManager.getAgent()

    getDidJsFromMetadata(agent, canisterId).then(async (idlFactory) => {
      if (!idlFactory) {
        try {
          idlFactory = await getDidJsFromTmpHack(agent, canisterId)
        } catch (err) {
          if (/no query method/.test(err as any)) {
            console.warn(err)
            idlFactory = undefined
          } else {
            throw err
          }
        }

        if (!idlFactory) {
          console.warn("No query method found for canister", canisterId)
        }
      }
      setDidJS(idlFactory)
      setFetching(false)
    })
  }, [canisterId, agentManager])

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
      {fetching || hooks === null ? loadingComponent : children}
    </ActorContext.Provider>
  )
}
