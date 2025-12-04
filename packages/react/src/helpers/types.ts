import { AgentError, CallConfig } from "@icp-sdk/core/agent"
import type {
  IDL,
  ActorState,
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
  MethodAttributes,
  CompiledResult,
  ExtractOk,
  ExtractErr,
} from "../types"

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

/**
 * The return type for authentication hooks.
 */
export interface UseAuthReturnType {
  /**
   * Any non-login related error that occurred.
   */
  error: Error | undefined

  /**
   * @deprecated Use `isAuthenticated` instead.
   * Indicates whether the user is authenticated.
   */
  authenticated: boolean

  /**
   * Indicates whether the user is authenticated.
   */
  isAuthenticated: boolean

  /**
   * @deprecated Use `isAuthenticating` instead.
   * Indicates whether an authentication request is in progress.
   */
  authenticating: boolean

  /**
   * Indicates whether an authentication request is in progress.
   */
  isAuthenticating: boolean

  /**
   * The current identity object, or `null` if not authenticated.
   */
  identity: Identity | null

  /**
   * Initiates the login flow with optional parameters.
   * @param options Login parameters (e.g. redirect URL).
   */
  login: (options?: LoginParameters) => Promise<void>

  /**
   * Logs the user out with optional parameters.
   * @param options Logout parameters (e.g. return URL).
   */
  logout: (options?: LogoutParameters) => Promise<void>

  /**
   * Triggers the authentication flow and resolves to an `Identity`.
   */
  authenticate: () => Promise<Identity>

  /**
   * @deprecated Use `isLoginLoading` instead.
   * Indicates whether the login operation is in progress.
   */
  loginLoading: boolean

  /**
   * Indicates whether the login operation is in progress.
   */
  isLoginLoading: boolean

  /**
   * The error message, if any, occurred during login.
   */
  loginError: string | undefined
}

/**
 * Represents the state of a login operation.
 */
export type LoginState = {
  /**
   * @deprecated Use `isLoading` instead.
   * Indicates whether the login operation is in progress.
   */
  loading: boolean

  /**
   * Indicates whether the login operation is in progress.
   */
  isLoading: boolean

  /**
   * The error message, if any, occurred during login.
   */
  error: string | undefined
}

export type LoginParameters = AuthClientLoginOptions

export type LogoutParameters = { returnTo?: string }

export type UseActorStore<A> = <T>(callback?: (state: ActorState<A>) => T) => T

export interface UseActorStateReturnType
  extends Omit<ActorState, "methodState"> {
  canisterId: string
}

/**
 * State for shared calls, including the result, error, and loading status.
 */
export type UseSharedCallState<A, M extends FunctionName<A>> = {
  /**
   * The data returned from the call, or `undefined` if not yet available.
   */
  data: ActorMethodReturnType<A[M]> | undefined

  /**
   * The error that occurred during the call, or `undefined` if none.
   */
  error: AgentError | undefined

  /**
   * @deprecated Use `isLoading` instead.
   * Indicates whether the call is in progress.
   */
  loading: boolean

  /**
   * Indicates whether the call is in progress.
   */
  isLoading: boolean
}

export interface UseSharedCallParameters<A, M extends FunctionName<A>>
  extends CallConfig {
  functionName: M
  args?: ActorMethodParameters<A[M]>
  onLoading?: (loading: boolean) => void
  onError?: (error: AgentError | undefined) => void
  onSuccess?: (data: ActorMethodReturnType<A[M]>) => void
  onSuccessResult?: (value: ExtractOk<ActorMethodReturnType<A[M]>>) => void
  onErrorResult?: (error: ExtractErr<ActorMethodReturnType<A[M]>>) => void
  throwOnError?: boolean
}

export interface UseSharedCallReturnType<
  A,
  M extends FunctionName<A> = FunctionName<A>
> extends UseSharedCallState<A, M> {
  requestKey: string
  reset: () => void
  compileResult: () => CompiledResult<ActorMethodReturnType<A[M]>>
  call: (
    eventOrReplaceArgs?: ActorMethodParameters<A[M]> | React.MouseEvent
  ) => Promise<ActorMethodReturnType<A[M]> | undefined>
}

export type UseSharedCall<A> = <M extends FunctionName<A>>(
  params: UseSharedCallParameters<A, M>
) => UseSharedCallReturnType<A, M>

export interface UseQueryCallParameters<A, M extends FunctionName<A>>
  extends UseSharedCallParameters<A, M> {
  refetchOnMount?: boolean
  refetchInterval?: number | false
}

export interface UseQueryCallReturnType<A, M extends FunctionName<A>>
  extends UseSharedCallReturnType<A, M> {
  refetch: () => void
}

export type UseQueryCall<A> = <M extends FunctionName<A>>(
  params: UseQueryCallParameters<A, M>
) => UseQueryCallReturnType<A, M>

export type UseUpdateCallParameters<
  A,
  M extends FunctionName<A>
> = UseSharedCallParameters<A, M>

export type UseUpdateCallReturnType<
  A,
  M extends FunctionName<A>
> = UseSharedCallReturnType<A, M>

export type UseUpdateCall<A> = <M extends FunctionName<A>>(
  params: UseUpdateCallParameters<A, M>
) => UseUpdateCallReturnType<A, M>

export interface DynamicDataArgs<V = unknown> {
  label: string
  value: V
}

export type UseMethodParameters<
  A,
  M extends FunctionName<A>
> = UseQueryCallParameters<A, M>

export interface UseMethodReturnType<
  A,
  M extends FunctionName<A> = FunctionName<A>
> {
  /**
   * @deprecated Use `isLoading` instead.
   * Indicates whether the method call is in progress.
   */
  loading: boolean

  /**
   * Indicates whether the method call is in progress.
   */
  isLoading: boolean

  /**
   * Indicates whether the argument form is required for the method.
   */
  isFormRequired: boolean

  /**
   * A unique key representing the current request instance.
   */
  requestKey: string

  /**
   * The error that occurred during the method call, if any.
   */
  error: AgentError | undefined

  /**
   * The data returned from the method call, or `undefined` if not yet available.
   */
  data: ActorMethodReturnType<A[M]> | undefined

  /**
   * Validates the provided arguments against the method signature.
   * @param args Optional arguments for the method.
   * @returns `true` if the arguments match the expected signature, otherwise `false`.
   */
  validateArgs: (args?: ActorMethodParameters<A[M]>) => boolean

  /**
   * The visit service function corresponding to this method.
   */
  visit: VisitService<A>[M]

  /**
   * Resets the method state (data, error, loading) to initial values.
   */
  reset: () => void

  /**
   * Invokes the method.
   * @param eventOrReplaceArgs Either the arguments for the call or a React mouse event.
   * @returns A promise resolving to the method's return data or `undefined`.
   */
  call: (
    eventOrReplaceArgs?: ActorMethodParameters<A[M]> | React.MouseEvent
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
  useActorStore: UseActorStore<A>
  useActorState: () => UseActorStateReturnType
  useActorInterface: () => IDL.ServiceClass
  useMethodNames: <Actor = A>() => FunctionName<Actor>[]
  useMethodAttributes: <Actor = A>() => MethodAttributes<Actor>
  useMethod: UseMethod<A>
  useQueryCall: UseQueryCall<A>
  useUpdateCall: UseUpdateCall<A>
  useVisitMethod: UseVisitMethod<A>
  useVisitService: UseVisitService<A>
}
