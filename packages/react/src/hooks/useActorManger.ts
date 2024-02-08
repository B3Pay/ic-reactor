import {
  ActorManagerOptions,
  ActorSubclass,
  DefaultActorType,
  IDL,
  createReActorStore,
} from "@ic-reactor/store"
import { useMemo } from "react"
import { AgentContextType, useAgentManager } from "../context/agent"
import useDidJs from "./useDidJs"

interface ActorManagerArgs
  extends Omit<
    ActorManagerOptions,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  didjsId?: string
  canisterId: string
  idlFactory?: IDL.InterfaceFactory
  agentContext?: AgentContextType
  withServiceFields?: boolean
  withServiceDetails?: boolean
}

export const useActorManager = <
  A extends ActorSubclass<any> = DefaultActorType
>({
  canisterId,
  agentContext,
  idlFactory: maybeIdlFactory,
  didjsId,
  withServiceFields = false,
  withServiceDetails = false,
  ...config
}: ActorManagerArgs) => {
  const agentManager = useAgentManager(agentContext)

  const {
    didJs: { idlFactory },
    ...rest
  } = useDidJs({
    canisterId,
    didjsId: didjsId,
    idlFactory: maybeIdlFactory,
  })

  const actorManager = useMemo(() => {
    if (!idlFactory) {
      return null
    } else {
      const manager = createReActorStore<A>({
        agentManager,
        idlFactory,
        canisterId,
        withDevtools: config.withDevtools,
        withServiceFields,
        withServiceDetails,
      })
      return manager
    }
  }, [idlFactory, withServiceFields, withServiceDetails])

  return { actorManager, ...rest }
}
