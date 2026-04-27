import type { HttpAgent, HttpAgentOptions, Identity } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { QueryClient } from "@tanstack/query-core"

/**
 * Parameters for configuring a ClientManager instance.
 *
 * @property {QueryClient} queryClient - The TanStack QueryClient used for caching and state management.
 * @property {number} [port] - The port used for the local IC replica (default is 4943).
 * @property {HttpAgentOptions} [agentOptions] - Optional configuration for the underlying HttpAgent.
 * @property {boolean} [withLocalEnv] - If true, configures the agent for a local environment.
 * @property {boolean} [withProcessEnv] - If true, auto-configures the agent based on process.env settings.
 */
export interface SignedIdentityAttributes {
  data: Uint8Array
  signature: Uint8Array
}

export interface IdentityAttributeRequest {
  keys: string[]
  nonce: Uint8Array
}

export interface IdentityAttributeValues {
  email?: string
  name?: string
  verified_email?: string
  [key: string]: string | undefined
}

export interface IdentityAttributeResult {
  principal: string
  requestedKeys: string[]
  signedAttributes: SignedIdentityAttributes
  decodedAttributes: IdentityAttributeValues
  completedAt: string
}

type IdentityAttributeOpenIdProviderAlias = "google" | "apple" | "microsoft"

export type IdentityAttributeOpenIdProvider =
  | IdentityAttributeOpenIdProviderAlias
  | (string & {})

export interface ClientManagerAuthClientOptions {
  identityProvider?: string | URL
  windowOpenerFeatures?: string
  openIdProvider?: IdentityAttributeOpenIdProvider
}

export interface AuthClientSignInOptions {
  maxTimeToLive?: bigint
  targets?: Principal[]
}

export interface ClientManagerSignInOptions
  extends AuthClientSignInOptions, ClientManagerAuthClientOptions {
  onSuccess?: () => void | Promise<void>
  onError?: (error?: string) => void | Promise<void>
}

export interface RequestIdentityAttributesParameters {
  keys: string[]
  nonce: Uint8Array
  identityProvider?: string | URL
  openIdProvider?: IdentityAttributeOpenIdProvider
  windowOpenerFeatures?: string
  signIn?: boolean
  maxTimeToLive?: bigint
  targets?: Principal[]
}

export interface RequestOpenIdIdentityAttributesParameters {
  nonce: Uint8Array
  openIdProvider: IdentityAttributeOpenIdProvider
  keys: string[]
  identityProvider?: string | URL
  windowOpenerFeatures?: string
  signIn?: boolean
  maxTimeToLive?: bigint
  targets?: Principal[]
}

export interface AuthClientLike {
  getIdentity(): Promise<Identity> | Identity
  isAuthenticated(): Promise<boolean> | boolean
  signIn(options?: AuthClientSignInOptions): Promise<Identity>
  logout(options?: { returnTo?: string }): Promise<void>
  requestAttributes(
    params: IdentityAttributeRequest
  ): Promise<SignedIdentityAttributes>
}

export interface ClientManagerParameters {
  /**
   * The TanStack QueryClient used for caching and state management.
   */
  queryClient: QueryClient
  /**
   * Optional configuration for the underlying HttpAgent.
   */
  agentOptions?: HttpAgentOptions
  /**
   * The port used for the local IC replica (default is 4943).
   */
  port?: number
  /**
   * If true, configures the agent for a local environment.
   */
  withLocalEnv?: boolean
  /**
   * If true, auto-configures the agent based on process.env settings.
   */
  withProcessEnv?: boolean
  /**
   * Optional pre-initialized AuthClient instance.
   * If provided, the manager will use this instance instead of dynamically importing
   * and creating a new one from `@icp-sdk/auth`.
   * This is useful for environments where dynamic imports are not supported or
   * when you want to share an AuthClient instance across multiple managers.
   */
  authClient?: AuthClientLike
  /**
   * **EXPERIMENTAL** - If true, uses the canister environment from `@icp-sdk/core/agent/canister-env`
   * to automatically configure the agent host and root key based on the `ic_env` cookie.
   *
   * ⚠️ This feature is experimental and may cause issues with update calls on localhost development.
   * Use with caution and only when you need automatic environment detection from the IC SDK.
   *
   * @experimental
   * @default false
   */
  withCanisterEnv?: boolean
}

/**
 * Represents the state of an agent.
 */
export interface AgentState {
  /**
   * Indicates whether the agent has been initialized.
   */
  isInitialized: boolean

  /**
   * Indicates whether the agent is in the process of initializing.
   */
  isInitializing: boolean

  /**
   * Represents an error associated with the agent, if any.
   */
  error: Error | undefined

  /**
   * Represents the network associated with the agent, if any.
   */
  network: string | undefined

  /**
   * Indicates whether the agent is connected to a local network.
   */
  isLocalhost: boolean
}

/**
 * Represents the authentication state of an agent.
 */
export interface AuthState {
  identity: Identity | null

  /**
   * Indicates whether the authentication process is ongoing.
   */
  isAuthenticating: boolean

  /**
   * Indicates whether the agent is authenticated.
   */
  isAuthenticated: boolean

  /**
   * Represents any error that occurred during authentication.
   */
  error: Error | undefined
}

export interface UpdateAgentParameters extends HttpAgentOptions {
  agent?: HttpAgent
}
