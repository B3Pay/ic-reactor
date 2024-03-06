import type { ServiceClass } from "@dfinity/candid/lib/cjs/idl"
import type {
  ActorState,
  CanisterId,
  AuthClientLoginOptions,
  ActorMethodParameters,
  ActorMethodReturnType,
  Identity,
  Principal,
  FunctionName,
  VisitService,
  AuthState,
  HttpAgent,
  AgentState,
  BaseActor,
} from "@ic-reactor/core/dist/types"

export interface AgentHooksReturnType {
  useAgent: () => HttpAgent | undefined
  useAgentState: () => AgentState
}

export interface AuthHooksReturnType {
  useAuth: (options?: UseAuthParameters) => UseAuthReturnType
  useAuthState: () => AuthState
  useUserPrincipal: () => Principal | undefined
}

export interface UseAuthParameters {
  onAuthentication?: (promise: () => Promise<Identity>) => void
  onAuthenticationSuccess?: (identity: Identity) => void
  onAuthenticationFailure?: (error: string | undefined) => void
  onLoginSuccess?: (principal: Principal) => void
  onLoginError?: (error: string | undefined) => void
  onLogin?: (promise: () => Promise<Principal>) => void
  onLoggedOut?: () => void
}

export interface UseAuthReturnType {
  error: Error | undefined
  authenticated: boolean
  authenticating: boolean
  identity: Identity | null
  login: (options?: LoginParameters) => Promise<void>
  logout: (options?: LogoutParameters) => Promise<void>
  authenticate: () => Promise<Identity>
  loginLoading: boolean
  loginError: string | undefined
}

export type LoginState = {
  loading: boolean
  error: string | undefined
}

export type LoginParameters = AuthClientLoginOptions

export type LogoutParameters = { returnTo?: string }

export interface UseActorState extends Omit<ActorState, "methodState"> {
  canisterId: CanisterId
}

export type UseSharedCallParameters<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodParameters<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type UseSharedCallState<A, M extends FunctionName<A>> = {
  data: ActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface UseSharedCallReturnType<
  A,
  M extends FunctionName<A> = FunctionName<A>
> extends UseSharedCallState<A, M> {
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export type UseSharedCall<A> = <M extends FunctionName<A>>(
  args: UseSharedCallParameters<A, M>
) => UseSharedCallReturnType<A, M>

export interface UseQueryCallParameters<A, M extends FunctionName<A>>
  extends UseSharedCallParameters<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export type UseQueryCall<A> = <M extends FunctionName<A>>(
  args: UseQueryCallParameters<A, M>
) => UseSharedCallReturnType<A, M>

export interface UseUpdateCallParameters<A, M extends FunctionName<A>>
  extends UseSharedCallParameters<A, M> {}

export type UseUpdateCall<A> = <M extends FunctionName<A>>(
  args: UseUpdateCallParameters<A, M>
) => UseSharedCallReturnType<A, M>

export interface DynamicDataArgs<V = unknown> {
  label: string
  value: V
}

export interface UseMethodParameters<A, M extends FunctionName<A>>
  extends UseSharedCallParameters<A, M> {}

export interface UseMethodReturnType<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  loading: boolean
  error: Error | undefined
  data: ActorMethodReturnType<A[M]> | undefined
  visit: VisitService<A>[M]
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export type UseMethod<A> = <M extends FunctionName<A>>(
  args: UseMethodParameters<A, M>
) => UseMethodReturnType<A, M>

export type UseVisitMethod<A> = <M extends FunctionName<A>>(
  functionName: M
) => VisitService<A>[M]

export type UseVisitService<A> = () => VisitService<A>

export interface ActorHooksReturnType<A = BaseActor> {
  initialize: () => Promise<void>
  useActorState: () => UseActorState
  useActorInterface: () => ServiceClass
  useMethodNames: () => FunctionName<A>[]
  useMethod: UseMethod<A>
  useQueryCall: UseQueryCall<A>
  useUpdateCall: UseUpdateCall<A>
  useVisitMethod: UseVisitMethod<A>
  useVisitService: UseVisitService<A>
}
