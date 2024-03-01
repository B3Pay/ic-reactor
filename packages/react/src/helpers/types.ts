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
  onAuthenticationFailure?: (error: Error) => void
  onLoginSuccess?: (principal: Principal) => void
  onLoginError?: (error: Error) => void
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
  loginError: Error | null
}

export type LoginState = {
  loading: boolean
  error: Error | null
}

export type LoginParameters = AuthClientLoginOptions

export type LogoutParameters = { returnTo?: string }

export interface UseActorState extends Omit<ActorState, "methodState"> {
  canisterId: CanisterId
}

export type UseMethodCallParameters<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodParameters<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: Error | undefined) => void
  onSuccess?: (data: ActorMethodReturnType<A[M]> | undefined) => void
  throwOnError?: boolean
}

export type ActorCallState<A, M extends FunctionName<A>> = {
  data: ActorMethodReturnType<A[M]> | undefined
  error: Error | undefined
  loading: boolean
}

export interface UseQueryCallParameters<A, M extends FunctionName<A>>
  extends UseMethodCallParameters<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export interface UseUpdateCallParameters<A, M extends FunctionName<A>>
  extends UseMethodCallParameters<A, M> {}

export interface UseMethodCallReturnType<
  A,
  M extends FunctionName<A> = FunctionName<A>
> extends ActorCallState<A, M> {
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export interface UseMethodReturnType<
  A,
  M extends FunctionName<A> = FunctionName<A>
> extends ActorCallState<A, M> {
  visit: VisitService<A>[M]
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ActorMethodParameters<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export type UseMethod<A> = <M extends FunctionName<A>>(
  args: UseMethodCallParameters<A, M>
) => UseMethodReturnType<A, M>

export type UseMethodCall<A> = <M extends FunctionName<A>>(
  args: UseMethodCallParameters<A, M>
) => UseMethodCallReturnType<A, M>

export type UseQueryCall<A> = <M extends FunctionName<A>>(
  args: UseQueryCallParameters<A, M>
) => UseMethodCallReturnType<A, M>

export type UseUpdateCall<A> = <M extends FunctionName<A>>(
  args: UseUpdateCallParameters<A, M>
) => UseMethodCallReturnType<A, M>

export type UseVisitMethod<A> = <M extends FunctionName<A>>(
  functionName: M
) => VisitService<A>[M]

export type UseVisitService<A> = () => VisitService<A>

export interface ActorHooksReturnType<A = BaseActor> {
  initialize: () => Promise<void>
  useActorState: () => UseActorState
  useActorInterface: () => ServiceClass
  useMethod: UseMethod<A>
  useQueryCall: UseQueryCall<A>
  useUpdateCall: UseUpdateCall<A>
  useVisitMethod: UseVisitMethod<A>
  useVisitService: UseVisitService<A>
}
