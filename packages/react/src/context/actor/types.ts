import { IDL } from "@dfinity/candid"
import {
  ActorSubclass,
  ActorManagerOptions,
  DefaultActorType,
} from "@ic-reactor/store"
import { AgentContextType } from "../agent"
import { ActorHooks } from "../../types"

export type ActorContextType<
  Actor = ActorSubclass<any>,
  F extends boolean = true
> = ActorHooks<Actor, F> & {
  ActorContext: React.Context<ActorContextType<Actor, F> | null>
  useActor: <A extends ActorSubclass<any> = Actor>() => ActorContextType<A>
  ActorProvider: React.FC<ActorProviderProps>
}

export type CreateReActorContext = {
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withVisitor: true
    }
  ): ActorContextType<A, true>

  <A extends ActorSubclass<any> = DefaultActorType>(
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
