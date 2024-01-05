import React, {
  createContext,
  useState,
  useEffect,
  PropsWithChildren,
  useMemo,
  useCallback,
} from "react"
import { ActorSubclass, HttpAgent } from "@dfinity/agent"
import { createReActor } from "./index"
import { IDL } from "@dfinity/candid"
import { getDidJsFromMetadata, getDidJsFromTmpHack } from "@ic-reactor/store"
import { ReActorOptions } from "@ic-reactor/store"

export type ReActor<A> = ReturnType<typeof createReActor<A>>

export interface ReActorContextType<A = ActorSubclass<any>>
  extends ReActor<A> {}

export const ReActorContext = createContext<ReActorContextType | null>(null)

export const useReActor = <
  A = ActorSubclass<any>,
>(): ReActorContextType<A> => {
  const context = React.useContext(ReActorContext)

  if (!context) {
    throw new Error("useReActor must be used within a ReActorProvider")
  }

  return context
}

interface ReActorProviderProps
  extends PropsWithChildren,
    Omit<ReActorOptions, "idlFactory"> {
  idlFactory?: IDL.InterfaceFactory
  loadingComponent?: React.ReactNode
}

export const ReActorProvider: React.FC<ReActorProviderProps> = ({
  children,
  loadingComponent = <div>Loading...</div>,
  ...config
}) => {
  const [didJs, setDidJS] = useState<{ idlFactory: IDL.InterfaceFactory }>()

  const fetchDidJs = useCallback(async () => {
    const { canisterId } = config
    if (!canisterId) {
      throw new Error("canisterId is required")
    }

    const agent = new HttpAgent({ ...config })

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
  }, [config.canisterId])

  useEffect(() => {
    const { idlFactory } = config

    if (idlFactory) {
      setDidJS({ idlFactory })
      return
    }

    fetchDidJs()
  }, [fetchDidJs, config.idlFactory])

  const reActorHooks = useMemo(() => {
    if (!didJs) {
      return null
    }
    try {
      return createReActor<any>({
        ...config,
        idlFactory: didJs.idlFactory,
      })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [config, didJs])

  return (
    <ReActorContext.Provider value={reActorHooks}>
      {reActorHooks ? children : loadingComponent}
    </ReActorContext.Provider>
  )
}
