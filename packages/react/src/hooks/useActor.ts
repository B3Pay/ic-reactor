import { createReactorStore } from "@ic-reactor/core"
import { useMemo } from "react"
import { useAgentManager } from "../provider/agent"
import { useCandid } from "./useCandid"
import { IDL } from "@dfinity/candid"
import { ActorManagerOptions, BaseActor } from "@ic-reactor/core/dist/types"
import { AgentContextType } from "../types"

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

/**
 * A hook to create an actor manager and fetch the actor's candid interface.
 *
 * @category Hooks
 */
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
      const manager = createReactorStore<A>({
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
