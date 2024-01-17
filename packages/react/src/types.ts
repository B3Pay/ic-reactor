import type {
  ActorState,
  ActorSubclass,
  CanisterId,
  CreateReActorOptions,
  ExtractActorMethodArgs,
  ExtractActorMethodReturnType,
  ExtractedFunction,
  ExtractedService,
  Identity,
  Principal,
  ServiceMethodType,
  ServiceMethodTypeAndName,
} from "@ic-reactor/store"
import { AuthHooks } from "./hooks/auth"
export type * from "@ic-reactor/store"
export type * from "@ic-reactor/store/dist/actor/types"

export type AuthArgs = {
  onAuthentication?: (promise: () => Promise<Identity>) => void
  onAuthenticationSuccess?: (identity: Identity) => void
  onAuthenticationFailure?: (error: Error) => void
  onLoginSuccess?: (principal: Principal) => void
  onLoginError?: (error: Error) => void
  onLogin?: (promise: () => Promise<Principal>) => void
  onLoggedOut?: () => void
}

export type ActorCallArgs<A, M extends keyof A> = {
  functionName: M & string
  args?: ExtractActorMethodArgs<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ExtractActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type ActorHookState<A, M extends keyof A> = {
  data: ExtractActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface ActorUseQueryArgs<A, M extends keyof A>
  extends ActorCallArgs<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export interface ActorUseQueryReturn<
  A,
  M extends keyof A,
  W extends boolean = false
> {
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<unknown>
  field: W extends true ? ExtractedFunction<A> : undefined
  data: unknown
  error: Error | undefined
  loading: boolean
}

export interface ActorUseUpdateArgs<A, M extends keyof A>
  extends ActorCallArgs<A, M> {}

export interface ActorUseUpdateReturn<
  A,
  M extends keyof A,
  W extends boolean = false
> {
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ExtractActorMethodArgs<A[M]>
  ) => Promise<unknown>
  field: W extends true ? ExtractedFunction<A> : undefined
  data: unknown
  error: Error | undefined
  loading: boolean
}

export type ActorUseMethodArg<
  A,
  T extends ServiceMethodType
> = T extends "query"
  ? ActorUseQueryArgs<A, keyof A>
  : ActorUseUpdateArgs<A, keyof A>

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
  useServiceFields: () => ExtractedService<A>
  useMethodFields: () => ExtractedFunction<A>[]
  useMethodField: (functionName: keyof A & string) => ExtractedFunction<A>
  useMethods: () => ServiceMethodTypeAndName<A>[]
}

export type UseActorStoreReturn<A> = ActorState<A> & { canisterId: CanisterId }

export interface ActorDefaultHooks<A, W extends boolean = false> {
  initialize: () => Promise<void>
  useActorStore: () => UseActorStoreReturn<A>
  useQueryCall: <M extends keyof A>(
    args: ActorUseQueryArgs<A, M>
  ) => ActorUseQueryReturn<A, M, W>
  useUpdateCall: <M extends keyof A>(
    args: ActorUseUpdateArgs<A, M>
  ) => ActorUseUpdateReturn<A, M, W>
  useMethodCall: <M extends keyof A, T extends ServiceMethodType>(
    args: ActorUseMethodArg<A, T> & { type: T }
  ) => T extends "query"
    ? ActorUseQueryReturn<A, M, W>
    : ActorUseUpdateReturn<A, M, W>
}

export type CreateReActor = {
  <A extends ActorSubclass<any>>(
    options: CreateReActorOptions & { withServiceField: true }
  ): ActorHooksWithField<A> & AuthHooks
  <A extends ActorSubclass<any>>(
    options: CreateReActorOptions & { withServiceField?: false | undefined }
  ): ActorHooksWithoutField<A> & AuthHooks
}
