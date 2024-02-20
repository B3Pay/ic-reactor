import type { AuthClientLoginOptions } from "@dfinity/auth-client"
import type { getAgentHooks } from "./agent"
import type { getAuthHooks } from "./auth"
import type {
  ActorState,
  CanisterId,
  ActorMethodArgs,
  ActorMethodReturnType,
  Identity,
  Principal,
  FunctionName,
  VisitService,
  AuthClient,
} from "@ic-reactor/core/dist/types"

export type AgentHooks = ReturnType<typeof getAgentHooks>

export type AuthHooks = ReturnType<typeof getAuthHooks>

export interface UseAuthClientArgs {
  onAuthentication?: (promise: () => Promise<Identity>) => void
  onAuthenticationSuccess?: (identity: Identity) => void
  onAuthenticationFailure?: (error: Error) => void
  onLoginSuccess?: (principal: Principal) => void
  onLoginError?: (error: Error) => void
  onLogin?: (promise: () => Promise<Principal>) => void
  onLoggedOut?: () => void
}

export interface UseAuthClientReturn {
  error: Error | undefined
  authClient: AuthClient | null
  authenticated: boolean
  authenticating: boolean
  identity: Identity | null
  login: (options?: LoginOptions) => Promise<void>
  logout: (options?: LogoutOptions) => Promise<void>
  authenticate: () => Promise<Identity>
  loginLoading: boolean
  loginError: Error | null
}

export type LoginState = {
  loading: boolean
  error: Error | null
}

export type LoginOptions = AuthClientLoginOptions

export type LogoutOptions = { returnTo?: string }

export type ReactorCallArgs<A, M extends FunctionName<A>> = {
  functionName: M
  args?: ActorMethodArgs<A[M]>
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

export interface UseQueryCallArgs<A, M extends FunctionName<A>>
  extends ReactorCallArgs<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export interface UseUpdateCallArgs<A, M extends FunctionName<A>>
  extends ReactorCallArgs<A, M> {}

export interface ReactorCallReturn<
  A,
  M extends FunctionName<A> = FunctionName<A>
> extends ActorCallState<A, M> {
  reset: () => void
  call: (
    eventOrReplaceArgs?: React.MouseEvent | ActorMethodArgs<A[M]>
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export type ReactorCall<A> = <M extends FunctionName<A>>(
  args: ReactorCallArgs<A, M>
) => ReactorCallReturn<A, M>

export type UseQueryCall<A> = <M extends FunctionName<A>>(
  args: UseQueryCallArgs<A, M>
) => ReactorCallReturn<A, M>

export type UseUpdateCall<A> = <M extends FunctionName<A>>(
  args: UseUpdateCallArgs<A, M>
) => ReactorCallReturn<A, M>

export type UseMethodCall<A> = <M extends FunctionName<A>>(
  args: UseMethodCallArg<A, M>
) => UseMethodCallReturn<A, M>

export interface UseMethodCallReturn<
  A,
  M extends FunctionName<A> = FunctionName<A>
> extends ReactorCallReturn<A, M> {
  visit: VisitService<A>[M]
  reset: () => void
  error: Error | undefined
  loading: boolean
}

export type UseMethodCallArg<A, M extends FunctionName<A>> = ReactorCallArgs<
  A,
  M
>

export interface UseActorState extends Omit<ActorState, "methodState"> {
  canisterId: CanisterId
}

export interface ActorHooks<A> {
  initialize: () => Promise<void>
  useActorState: () => UseActorState
  useQueryCall: UseQueryCall<A>
  useUpdateCall: UseUpdateCall<A>
  useMethodCall: UseMethodCall<A>
  useVisitMethod: <M extends FunctionName<A>>(
    functionName: M
  ) => VisitService<A>[M]
}
