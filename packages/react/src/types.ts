import type {
  ActorState,
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

export interface ActorUseUpdateArgs<A, M extends FunctionName<A>>
  extends ActorCallArgs<A, M> {}

export interface SharedActorHookState<A, M extends FunctionName<A>> {
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ActorUseQueryReturn<A, M extends FunctionName<A>>
  extends SharedActorHookState<A, M> {}

export interface ActorUseUpdateReturn<A, M extends FunctionName<A>>
  extends SharedActorHookState<A, M> {}

export interface ActorUseMethodCallReturn<
  A,
  M extends FunctionName<A>,
  F extends boolean = false,
  D extends boolean = false
> extends SharedActorHookState<A, M> {
  field: F extends true ? MethodFields<A> : undefined
  detail: D extends true ? MethodDetails<A> : undefined
}

export type ActorUseMethodCallArg<A, T extends FunctionType> = T extends "query"
  ? ActorUseQueryArgs<A, FunctionName<A>>
  : ActorUseUpdateArgs<A, FunctionName<A>>

export type ActorHooks<
  A,
  F extends boolean = false,
  D extends boolean = false
> = ActorDefaultHooks<A, F, D> &
  (F extends true ? ActorFieldHooks<A> : {}) &
  (D extends true ? ActorDetailHooks<A> : {})

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

export interface ActorDefaultHooks<A, F extends boolean, D extends boolean> {
  initialize: () => Promise<void>
  useActorStore: () => UseActorStoreReturn<A>
  useQueryCall: <M extends FunctionName<A>>(
    args: ActorUseQueryArgs<A, M>
  ) => ActorUseQueryReturn<A, M>
  useUpdateCall: <M extends FunctionName<A>>(
    args: ActorUseUpdateArgs<A, M>
  ) => ActorUseUpdateReturn<A, M>
  useMethodCall: <M extends FunctionName<A>, T extends FunctionType>(
    args: ActorUseMethodCallArg<A, T>
  ) => ActorUseMethodCallReturn<A, M, F, D>
}

export type GetFunctions<A> = {
  getAgent: () => HttpAgent
  getServiceFields: () => ExtractedServiceFields<A>
  getServiceDetails: () => ExtractedServiceDetails<A>
}

export type CreateReActor = {
  // When withServiceFields is true and withServiceDetails is true
  <A>(
    options: CreateReActorOptions & {
      withServiceFields: true
      withServiceDetails: true
    }
  ): GetFunctions<A> & ActorHooks<A, true, true> & AuthHooks

  // When withServiceFields is true and withServiceDetails is false or undefined
  <A>(
    options: CreateReActorOptions & {
      withServiceFields: true
      withServiceDetails?: false | undefined
    }
  ): GetFunctions<A> & ActorHooks<A, true, false> & AuthHooks

  // When withServiceFields is false or undefined and withServiceDetails is true
  <A>(
    options: CreateReActorOptions & {
      withServiceFields?: false | undefined
      withServiceDetails: true
    }
  ): GetFunctions<A> & ActorHooks<A, false, true> & AuthHooks

  // When both withServiceFields and withServiceDetails are false or undefined
  <A>(
    options: CreateReActorOptions & {
      withServiceFields?: false | undefined
      withServiceDetails?: false | undefined
    }
  ): GetFunctions<A> & ActorHooks<A, false, false> & AuthHooks
}
