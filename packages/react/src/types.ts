import type {
  ActorState,
  CanisterId,
  CreateReactorOptions,
  ActorMethodArgs,
  ActorMethodReturnType,
  HttpAgent,
  Identity,
  Principal,
  FunctionName,
  VisitService,
} from "@ic-reactor/core/dist/types"
import type { AgentHooks, AuthHooks } from "./helpers/types"

export * from "@ic-reactor/core/dist/types"
export * from "./context/agent/types"
export * from "./context/actor/types"
export * from "./helpers/types"

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
  functionName: M
  args?: ActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type ActorHookState<A, M extends FunctionName<A>> = {
  data: ActorMethodReturnType<A[M]> | undefined
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

export type ActorCallReturn<A, M extends FunctionName<A>> = ActorHookState<
  A,
  M
> & {
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ActorMethodArgs<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export type ActorCall<A> = <M extends FunctionName<A>>(
  args: ActorCallArgs<A, M>
) => ActorCallReturn<A, M>

export type ActorQueryCall<A> = <M extends FunctionName<A>>(
  args: ActorUseQueryArgs<A, M>
) => ActorCallReturn<A, M>

export type ActorUpdateCall<A> = <M extends FunctionName<A>>(
  args: ActorUseUpdateArgs<A, M>
) => ActorCallReturn<A, M>

export type ActorMethodCall<A, M extends FunctionName<A>> = (
  args: ActorUseMethodCallArg<A, M>
) => ActorUseMethodCallReturn<A, M>

export interface ActorUseMethodCallReturn<
  A,
  M extends FunctionName<A>,
  F extends boolean = false
> extends ActorCallReturn<A, M> {
  visit: F extends true ? VisitService<A>[M] : undefined
  reset: () => void
  error: Error | undefined
  loading: boolean
}

export type ActorUseMethodCallArg<A, M extends FunctionName<A>> = ActorCallArgs<
  A,
  M
>

export type ActorHooks<A, F extends boolean = false> = ActorDefaultHooks<A, F> &
  (F extends true ? ActorFieldHooks<A> : object)

export interface ActorFieldHooks<A> {
  useVisitMethod: <M extends FunctionName<A>>(
    functionName: M
  ) => VisitService<A>[M]
}

export type UseActorStoreReturn<A> = ActorState<A> & { canisterId: CanisterId }

export interface ActorDefaultHooks<A, F extends boolean> {
  initialize: () => Promise<void>
  useActorState: () => UseActorStoreReturn<A>
  useQueryCall: ActorQueryCall<A>
  useUpdateCall: ActorUpdateCall<A>
  useMethodCall: <M extends FunctionName<A>>(
    args: ActorUseMethodCallArg<A, M>
  ) => ActorUseMethodCallReturn<A, M, F>
}

export type GetFunctions<A> = {
  getAgent: () => HttpAgent
  getVisitFunction: () => VisitService<A>
}

export type CreateReactor = {
  // When withVisitor is true
  <A>(
    options: CreateReactorOptions & {
      withVisitor: true
    }
  ): GetFunctions<A> & ActorHooks<A, true> & AuthHooks & AgentHooks

  // When withVisitor are false or undefined
  <A>(
    options: CreateReactorOptions & {
      withVisitor?: false | undefined
    }
  ): GetFunctions<A> & ActorHooks<A, false> & AuthHooks & AgentHooks
}
