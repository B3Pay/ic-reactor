import type {
  IDL,
  ActorHooksReturnType,
  BaseActor,
  ActorManagerParameters,
  CanisterId,
} from "../../types"

export interface CreateActorContextReturnType<A = BaseActor>
  extends ActorHooksReturnType<A> {
  ActorProvider: React.FC<ActorProviderProps>
  ActorHookProvider: React.FC<ActorHookProviderProps<A>>
}

export interface ActorHookProviderProps<A> {
  hooks: ActorHooksReturnType<A>
  children?: React.ReactNode
}

export interface ActorProviderProps extends CreateActorContextParameters {
  children?: React.ReactNode | undefined
  candidString?: string
  loadingComponent?: React.ReactNode
  authenticatingComponent?: React.ReactNode
}

export interface CreateActorContextParameters
  extends Omit<
    ActorManagerParameters,
    "idlFactory" | "agentManager" | "canisterId"
  > {
  didjsId?: string
  canisterId?: CanisterId
  idlFactory?: IDL.InterfaceFactory
  disableAutoFetch?: boolean
}
