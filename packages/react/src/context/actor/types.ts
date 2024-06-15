import type {
  IDL,
  ActorHooksReturnType,
  BaseActor,
  ActorManagerParameters,
  CanisterId,
  InitializeActor,
} from "../../types"

export interface CreateActorContextType<A = BaseActor>
  extends ActorHooksReturnType<A> {
  useInitializeActor?: () => InitializeActor
}

export interface CreateActorContextReturnType<A = BaseActor>
  extends ActorHooksReturnType<A> {
  ActorProvider: React.FC<ActorProviderProps>
  ActorHookProvider: React.FC<ActorHookProviderProps<A>>
  useInitializeActor: () => InitializeActor
}

export interface ActorHookProviderProps<A> {
  hooks: ActorHooksReturnType<A>
  children?: React.ReactNode
}

export interface ActorProviderProps extends CreateActorContextParameters {
  children?: React.ReactNode | undefined
  candidString?: string
  fetchingComponent?: React.ReactNode
  errorComponent?: (error: string) => React.ReactNode
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

export interface ActorChildrenProps extends React.PropsWithChildren {
  useActorState: ActorHooksReturnType["useActorState"]
}
