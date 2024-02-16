import type {
  MethodFields,
  ExtractedServiceFields,
  ExtractedServiceDetails,
  ServiceDetails,
  MethodDetails,
  MethodResult,
} from "@ic-reactor/visitor"
import type {
  ActorState,
  CanisterId,
  CreateReActorOptions,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  HttpAgent,
  Identity,
  Principal,
  FunctionType,
  FunctionName,
  ExtractedService,
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
  onSuccess?: (
    data: MethodResult<A, M>[] | ExtractActorMethodReturnType<A[M]> | undefined
  ) => void
  throwOnError?: boolean
}

export type ActorHookState<A, M extends FunctionName<A>> = {
  data: MethodResult<A, M>[] | ExtractActorMethodReturnType<A[M]> | undefined
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

export type ActorCall<A> = {
  <M extends FunctionName<A>>(
    args: ActorCallArgs<A, M> & { withTransform: true }
  ): {
    reset: () => void
    error: Error | undefined
    loading: boolean
    call: (
      eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
    ) => Promise<MethodResult<A, M>[] | undefined>
    data: MethodResult<A, M>[] | undefined
  }
  <M extends FunctionName<A>>(
    args: ActorCallArgs<A, M> & { withTransform?: false }
  ): {
    reset: () => void
    error: Error | undefined
    loading: boolean
    call: (
      eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
    ) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>
    data: ExtractActorMethodReturnType<A[M]> | undefined
  }
}

export type ActorQueryCall<A> = {
  <M extends FunctionName<A>>(
    args: ActorUseQueryArgs<A, M> & { withTransform: true }
  ): {
    reset: () => void
    error: Error | undefined
    loading: boolean
    call: (
      eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
    ) => Promise<MethodResult<A, M>[] | undefined>
    data: MethodResult<A, M>[] | undefined
  }
  <M extends FunctionName<A>>(
    args: ActorUseQueryArgs<A, M> & { withTransform?: false }
  ): {
    reset: () => void
    error: Error | undefined
    loading: boolean
    call: (
      eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
    ) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>
    data: ExtractActorMethodReturnType<A[M]> | undefined
  }
}

export type ActorUpdateCall<A> = {
  <M extends FunctionName<A>>(
    args: ActorUseUpdateArgs<A, M> & { withTransform: true }
  ): {
    reset: () => void
    error: Error | undefined
    loading: boolean
    call: (
      eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
    ) => Promise<MethodResult<A, M>[] | undefined>
    data: MethodResult<A, M>[] | undefined
  }
  <M extends FunctionName<A>>(
    args: ActorUseUpdateArgs<A, M> & { withTransform?: false }
  ): {
    reset: () => void
    error: Error | undefined
    loading: boolean
    call: (
      eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
    ) => Promise<ExtractActorMethodReturnType<A[M]> | undefined>
    data: ExtractActorMethodReturnType<A[M]> | undefined
  }
}

export interface ActorUseMethodCallReturn<
  A,
  M extends FunctionName<A>,
  F extends boolean = false,
  D extends boolean = false
> {
  field: F extends true ? MethodFields<A> : undefined
  detail: D extends true ? MethodDetails<A> : undefined
  reset: () => void
  generateArgs: () => ExtractActorMethodArgs<A[M]>
  generateReturns: () => MethodResult<A, M>[]
  error: Error | undefined
  loading: boolean
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<
    ExtractActorMethodReturnType<A[M]> | MethodResult<A, M>[] | undefined
  >
  data: ExtractActorMethodReturnType<A[M]> | MethodResult<A, M>[] | undefined
}

export type ActorUseMethodCallArg<
  A,
  T extends FunctionType
> = (T extends "query"
  ? ActorUseQueryArgs<A, FunctionName<A>>
  : ActorUseUpdateArgs<A, FunctionName<A>>) & { withTransform?: boolean }

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
  useQueryCall: ActorQueryCall<A>
  useUpdateCall: ActorUpdateCall<A>
  useMethodCall: <M extends FunctionName<A>, T extends FunctionType>(
    args: ActorUseMethodCallArg<A, T>
  ) => ActorUseMethodCallReturn<A, M, F, D>
}

export type GetFunctions<A> = {
  getAgent: () => HttpAgent
  getVisitFunction: () => ExtractedService<A>
}

export type CreateReActor = {
  // When withVisitor is true
  <A>(
    options: CreateReActorOptions & {
      withVisitor: true
    }
  ): GetFunctions<A> & ActorHooks<A, true, true> & AuthHooks

  // When withVisitor are false or undefined
  <A>(
    options: CreateReActorOptions & {
      withVisitor?: false | undefined
    }
  ): GetFunctions<A> & ActorHooks<A, false, false> & AuthHooks
}
