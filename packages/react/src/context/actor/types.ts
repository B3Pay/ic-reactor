import { IDL } from "@dfinity/candid"
import { ActorManagerOptions, BaseActor } from "@ic-reactor/core"
import { AgentContextType } from "../agent"
import { ActorHooks } from "../../types"

export type ActorContextType<
  Actor = BaseActor,
  F extends boolean = true
> = ActorHooks<Actor, F> & {
  ActorContext: React.Context<ActorContextType<Actor, F> | null>
  useActorContext: <A = Actor>() => ActorContextType<A>
  ActorProvider: React.FC<ActorProviderProps>
}

export type CreateReActorContext = {
  <A = BaseActor>(
    options?: Partial<CreateActorOptions> & {
      withVisitor: true
    }
  ): ActorContextType<A, true>

  <A = BaseActor>(
    options?: Partial<CreateActorOptions> & {
      withVisitor?: false | undefined
    }
  ): ActorContextType<A, false>
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

export interface ActorProviderProps extends CreateActorOptions {
  children?: React.ReactNode | undefined
  loadingComponent?: React.ReactNode
}
