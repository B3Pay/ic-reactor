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
  F extends boolean = false,
  D extends boolean = false
> {
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<unknown>
  field: F extends true ? MethodFields<A> : undefined
  detail: D extends true ? MethodDetails<A> : undefined
  data: unknown
  error: Error | undefined
  loading: boolean
}

export interface ActorUseUpdateArgs<A, M extends FunctionName<A>>
  extends ActorCallArgs<A, M> {}

export interface ActorUseUpdateReturn<
  A,
  M extends FunctionName<A>,
  F extends boolean = false,
  D extends boolean = false
> {
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<unknown>
  field: F extends true ? MethodFields<A> : undefined
  detail: D extends true ? MethodDetails<A> : undefined
  data: unknown
  error: Error | undefined
  loading: boolean
}

export type ActorUseMethodArg<A, T extends FunctionType> = T extends "query"
  ? ActorUseQueryArgs<A, FunctionName<A>>
  : ActorUseUpdateArgs<A, FunctionName<A>>

export type ActorHooksWithDetails<A> = ActorDefaultHooks<A, true> &
  ActorDetailHooks<A>
export type ActorHooksWithField<A> = ActorDefaultHooks<A, true> &
  ActorFieldHooks<A>

export type ActorHooks<
  A,
  F extends boolean | undefined = undefined,
  D extends boolean | undefined = undefined
> = F extends true
  ? D extends true
    ? ActorHooksWithField<A> & ActorHooksWithDetails<A>
    : ActorHooksWithField<A>
  : D extends true
  ? ActorHooksWithDetails<A>
  : ActorDefaultHooks<A, false>

export interface ActorFieldHooks<A> {
  useServiceFields: () => ExtractedServiceFields<A>
  useMethodFields: () => MethodFields<A>[]
  useMethodField: (functionName: FunctionName<A>) => MethodFields<A>
}

export interface ActorDetailHooks<A> {
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
  // When withServiceFields is true and withServiceDetails is true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options: CreateReActorOptions & {
      withServiceFields: true
      withServiceDetails: true
    }
  ): GetFunctions<A> &
    ActorHooksWithField<A> &
    ActorHooksWithDetails<A> &
    AuthHooks

  // When withServiceFields is true and withServiceDetails is false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options: CreateReActorOptions & {
      withServiceFields: true
      withServiceDetails?: false | undefined
    }
  ): GetFunctions<A> & ActorHooksWithField<A> & AuthHooks

  // When withServiceFields is false or undefined and withServiceDetails is true
  <A extends ActorSubclass<any> = DefaultActorType>(
    options: CreateReActorOptions & {
      withServiceFields?: false | undefined
      withServiceDetails: true
    }
  ): GetFunctions<A> & ActorHooksWithDetails<A> & AuthHooks

  // When both withServiceFields and withServiceDetails are false or undefined
  <A extends ActorSubclass<any> = DefaultActorType>(
    options: CreateReActorOptions & {
      withServiceFields?: false | undefined
      withServiceDetails?: false | undefined
    }
  ): GetFunctions<A> & ActorDefaultHooks<A, false> & AuthHooks
}
