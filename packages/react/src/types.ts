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

export type ActorCallArgs<A, M extends keyof A & string> = {
  functionName: M & string
  args?: ExtractActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ExtractActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type ActorHookState<A, M extends keyof A & string> = {
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ActorUseQueryArgs<A, M extends keyof A & string>
  extends ActorCallArgs<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export interface ActorUseQueryReturn<
  A,
  M extends keyof A & string,
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

export interface ActorUseUpdateArgs<A, M extends keyof A & string>
  extends ActorCallArgs<A, M> {}

export interface ActorUseUpdateReturn<
  A,
  M extends keyof A & string,
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
  ? ActorUseQueryArgs<A, keyof A & string>
  : ActorUseUpdateArgs<A, keyof A & string>

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
  useMethodField: (functionName: keyof A & string) => MethodFields<A>
  useServiceDetails: () => ExtractedServiceDetails<A>
  useMethodDetails: () => ServiceDetails<A>
  useMethodDetail: (functionName: keyof A & string) => MethodDetails<A>
}

export type UseActorStoreReturn<A> = ActorState<A> & { canisterId: CanisterId }

export interface ActorDefaultHooks<A, W extends boolean = false> {
  initialize: () => Promise<void>
  useActorStore: () => UseActorStoreReturn<A>
  useQueryCall: <M extends keyof A & string>(
    args: ActorUseQueryArgs<A, M>
  ) => ActorUseQueryReturn<A, M, W>
  useUpdateCall: <M extends keyof A & string>(
    args: ActorUseUpdateArgs<A, M>
  ) => ActorUseUpdateReturn<A, M, W>
  useMethodCall: <M extends keyof A & string, T extends FunctionType>(
    args: ActorUseMethodArg<A, T> & { type: T }
  ) => T extends "query"
    ? ActorUseQueryReturn<A, M, W>
    : ActorUseUpdateReturn<A, M, W>
}

export type GetFunctions<A> = {
  getAgent: () => HttpAgent
  getServiceFields: () => ExtractedServiceFields<A>
}

export type CreateReActor = {
  <A extends ActorSubclass<any>>(
    options: CreateReActorOptions & { withServiceFields: true }
  ): GetFunctions<A> & ActorHooksWithField<A> & AuthHooks
  <A extends ActorSubclass<any>>(
    options: CreateReActorOptions & { withServiceFields?: false | undefined }
  ): GetFunctions<A> & ActorHooksWithoutField<A> & AuthHooks
}
