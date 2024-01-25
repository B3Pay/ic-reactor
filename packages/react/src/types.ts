import type {
  ActorState,
  ActorSubclass,
  CanisterId,
  CreateReActorOptions,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  MethodFields,
  ExtractedServiceFields,
  HttpAgent,
  Identity,
  Principal,
  ExtractedServiceDetails,
  FunctionType,
  ServiceDetails,
  MethodDetails,
  FunctionName,
  DefaultActorType,
} from "@ic-reactor/store"
import type { AuthHooks } from "./hooks/auth"

export type AuthArgs = {
  onAuthentication?: (promise: () => Promise<Identity>) => void
  onAuthenticationSuccess?: (identity: Identity) => void
  onAuthenticationFailure?: (error: Error) => void
  onLoginSuccess?: (principal: Principal) => void
  onLoginError?: (error: Error) => void
  onLogin?: (promise: () => Promise<Principal>) => void
  onLoggedOut?: () => void
}

export type ActorCallArgs<A, M extends FunctionName<A>> = {
  functionName: M & string
  args?: ExtractActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ExtractActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type ActorHookState<A, M extends FunctionName<A>> = {
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ActorUseQueryArgs<A, M extends FunctionName<A>>
  extends ActorCallArgs<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export interface ActorUseQueryReturn<
  A,
  M extends FunctionName<A>,
  W extends boolean = false
> {
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<unknown>
  field: W extends true ? MethodFields<A> : undefined
  data: unknown
  error: Error | undefined
  loading: boolean
}

export interface ActorUseUpdateArgs<A, M extends FunctionName<A>>
  extends ActorCallArgs<A, M> {}

export interface ActorUseUpdateReturn<
  A,
  M extends FunctionName<A>,
  W extends boolean = false
> {
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<unknown>
  field: W extends true ? MethodFields<A> : undefined
  data: unknown
  error: Error | undefined
  loading: boolean
}

export type ActorUseMethodArg<A, T extends FunctionType> = T extends "query"
  ? ActorUseQueryArgs<A, FunctionName<A>>
  : ActorUseUpdateArgs<A, FunctionName<A>>

export type ActorHooksWithField<A> = ActorDefaultHooks<A, true> &
  ActorFieldHooks<A>
export type ActorHooksWithoutField<A> = ActorDefaultHooks<A, false>

export type ActorHooks<
  A,
  W extends boolean | undefined = undefined
> = W extends true
  ? ActorHooksWithField<A>
  : W extends false
  ? ActorHooksWithoutField<A>
  : ActorHooksWithField<A> | ActorHooksWithoutField<A>

export interface ActorFieldHooks<A> {
  useServiceFields: () => ExtractedServiceFields<A>
  useMethodFields: () => MethodFields<A>[]
  useMethodField: (functionName: FunctionName<A>) => MethodFields<A>
  useServiceDetails: () => ExtractedServiceDetails<A>
  useMethodDetails: () => ServiceDetails<A>
  useMethodDetail: (functionName: FunctionName<A>) => MethodDetails<A>
}

export type UseActorStoreReturn<A> = ActorState<A> & { canisterId: CanisterId }

export interface ActorDefaultHooks<A, W extends boolean = false> {
  initialize: () => Promise<void>
  useActorStore: () => UseActorStoreReturn<A>
  useQueryCall: <M extends FunctionName<A>>(
    args: ActorUseQueryArgs<A, M>
  ) => ActorUseQueryReturn<A, M, W>
  useUpdateCall: <M extends FunctionName<A>>(
    args: ActorUseUpdateArgs<A, M>
  ) => ActorUseUpdateReturn<A, M, W>
  useMethodCall: <M extends FunctionName<A>, T extends FunctionType>(
    args: ActorUseMethodArg<A, T> & { type: T }
  ) => T extends "query"
    ? ActorUseQueryReturn<A, M, W>
    : ActorUseUpdateReturn<A, M, W>
}

export type GetFunctions<A> = {
  getAgent: () => HttpAgent
  getServiceFields: () => ExtractedServiceFields<A>
  getServiceDetails: () => ExtractedServiceDetails<A>
}

export type CreateReActor = {
  <A extends ActorSubclass<any> = DefaultActorType>(
    options: CreateReActorOptions & { withServiceFields: true }
  ): GetFunctions<A> & ActorHooksWithField<A> & AuthHooks
  <A extends ActorSubclass<any> = DefaultActorType>(
    options: CreateReActorOptions & { withServiceFields?: false | undefined }
  ): GetFunctions<A> & ActorHooksWithoutField<A> & AuthHooks
}
