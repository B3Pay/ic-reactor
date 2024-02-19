import {
  ActorManagerOptions,
  BaseActor,
  IDL,
  createReActorStore,
} from "@ic-reactor/core"
import { useMemo } from "react"
import { AgentContextType, useAgentManager } from "../context/agent"
import { useCandid } from "./useCandid"

interface DynamicActorArgs
  extends Omit<
    ActorManagerOptions,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  canisterId: string
  idlFactory?: IDL.InterfaceFactory
  agentContext?: AgentContextType
  didjsCanisterId?: string
}

export const useActor = <A = BaseActor>({
  canisterId,
  agentContext,
  idlFactory: maybeIdlFactory,
  didjsCanisterId,
  ...config
}: DynamicActorArgs) => {
  const agentManager = useAgentManager(agentContext)

  const {
    candid: { idlFactory },
    ...rest
  } = useCandid({
    canisterId,
    didjsCanisterId,
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
      })
      return manager
    }
  }, [idlFactory])

  return { actorManager, ...rest }
}
