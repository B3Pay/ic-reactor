import type { Identity } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"

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
  IdentityAttributeOpenIdProviderAlias | (string & {})

export interface AuthenticationClientOptions {
  identityProvider?: string | URL
  windowOpenerFeatures?: string
  openIdProvider?: IdentityAttributeOpenIdProvider
}

export interface AuthClientSignInOptions {
  maxTimeToLive?: bigint
  targets?: Principal[]
}

export interface AuthenticationSignInOptions
  extends AuthClientSignInOptions, AuthenticationClientOptions {
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
  signOut(options?: { returnTo?: string }): Promise<void>
  requestAttributes(
    params: IdentityAttributeRequest
  ): Promise<SignedIdentityAttributes>
}

export interface AuthState {
  identity: Identity | null
  isAuthenticating: boolean
  isAuthenticated: boolean
  error: Error | undefined
}
