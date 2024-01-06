import React, {
  createContext,
  useState,
  useEffect,
  PropsWithChildren,
  useMemo,
  useCallback,
  useRef,
  useContext,
} from "react"
import { createReActor, type ReActorHooks } from "./index"
import { IDL } from "@dfinity/candid"
import {
  ActorSubclass,
  AgentManager,
  CreateReActorOptions,
  createAgentManager,
  getDidJsFromMetadata,
  getDidJsFromTmpHack,
} from "@ic-reactor/store"

export type ReActorContextType<A = ActorSubclass<any>> = ReActorHooks<A>

export const ReActorContext = createContext<ReActorContextType | null>(null)

export const useReActor = <
  A = ActorSubclass<any>,
>(): ReActorContextType<A> => {
  const context = useContext(ReActorContext)

  if (!context) {
    throw new Error("useReActor must be used within a ReActorProvider")
  }

  return context as ReActorContextType<A>
}

interface ReActorProviderProps
  extends PropsWithChildren,
    Omit<CreateReActorOptions, "idlFactory"> {
  agentManager?: AgentManager
  idlFactory?: IDL.InterfaceFactory
  loadingComponent?: React.ReactNode
}

export const ReActorProvider: React.FC<ReActorProviderProps> = ({
  children,
  canisterId,
  loadingComponent = <div>Loading...</div>,
  ...config
}) => {
  const agentManager = useRef(config.agentManager || createAgentManager(config))

  const [didJs, setDidJS] = useState<{ idlFactory: IDL.InterfaceFactory }>()

  const fetchDidJs = useCallback(async () => {
    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    const agent = agentManager.current.getAgent()

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
    })

    return didJs
  }, [canisterId])

  useEffect(() => {
    const { idlFactory } = config

    if (idlFactory) {
      setDidJS({ idlFactory })
      return
    }

    fetchDidJs()
  }, [fetchDidJs, config.idlFactory])

  const hooks = useMemo(() => {
    if (!didJs) {
      return null
    }
    try {
      return createReActor<any>({
        idlFactory: didJs.idlFactory,
        agentManager: agentManager.current,
        canisterId,
        withDevtools: config.withDevtools,
      })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [canisterId, didJs])

  return (
    <ReActorContext.Provider value={hooks}>
      {hooks === null ? loadingComponent : children}
    </ReActorContext.Provider>
  )
}
