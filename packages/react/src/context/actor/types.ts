import React, { PropsWithChildren } from "react"
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
  F extends boolean = true,
  D extends boolean = true
> = ActorHooks<Actor, F, D> & {
  ActorContext: React.Context<ActorContextType<Actor, F, D> | null>
  useActor: <A extends ActorSubclass<any> = Actor>() => ActorContextType<
    A,
    F,
    D
  >
  ActorProvider: React.FC<
    ActorProviderProps & {
      withServiceFields?: F
      withServiceDetails?: D
    }
  >
}

export type CreateReActorContext = {
  // When both withServiceFields and withServiceDetails are true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields: true
      withServiceDetails: true
    }
  ): ActorContextType<A, true, true>

  // When withServiceFields is true and withServiceDetails is false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields: true
      withServiceDetails?: false | undefined
    }
  ): ActorContextType<A, true, false>

  // When withServiceFields is false or undefined and withServiceDetails is true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
      withServiceDetails: true
    }
  ): ActorContextType<A, false, true>

  // When both withServiceFields and withServiceDetails are false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options?: Partial<CreateActorOptions> & {
      withServiceFields?: false | undefined
      withServiceDetails?: false | undefined
    }
  ): ActorContextType<A, false, false>
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
