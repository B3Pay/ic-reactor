import { IDL } from "@dfinity/candid"
import { ActorManagerOptions, BaseActor } from "@ic-reactor/core/dist/types"
import { ActorHooks, AgentContextType } from "../../types"

export interface ActorContextType<Actor = BaseActor> extends ActorHooks<Actor> {
  ActorContext: React.Context<ActorContextType<Actor> | null>
  useActorContext: <A = Actor>() => ActorContextType<A>
  ActorProvider: React.FC<ActorProviderProps>
}

export type CreateReactorContext = <A = BaseActor>(
  options?: Partial<CreateActorOptions>
) => ActorContextType<A>

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

export interface ActorProviderProps extends CreateActorOptions {
  children?: React.ReactNode | undefined
  loadingComponent?: React.ReactNode
}
