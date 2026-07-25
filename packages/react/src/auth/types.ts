import type { Identity, SignIdentity } from "@icp-sdk/core/agent"
import type { PartialIdentity } from "@icp-sdk/core/identity"
import type { Principal } from "@icp-sdk/core/principal"

export interface SignedIdentityAttributes {
  data: Uint8Array
  signature: Uint8Array
}

/**
 * The 32-byte nonce issued by the relying-party canister.
 *
 * A function (or promise) lets the Internet Identity window open while the
 * nonce is still being fetched, so the popup is opened inside the user gesture
 * instead of after it. `@icp-sdk/auth` v8 requires the function form; v7
 * accepts the promise form. IC Reactor normalizes whichever you pass to the
 * shape the installed client expects.
 */
export type IdentityAttributeNonce =
  Uint8Array | Promise<Uint8Array> | (() => Uint8Array | Promise<Uint8Array>)

export interface IdentityAttributeRequest {
  keys: string[]
  nonce: IdentityAttributeNonce
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

/**
 * The providers that Internet Identity supports for one-click sign-in. Only
 * these three reach the underlying auth client.
 */
type IdentityAttributeOpenIdProviderAlias = "google" | "apple" | "microsoft"

/**
 * An OpenID provider, either as a well-known alias or as a raw issuer URL.
 *
 * The two forms are **not** interchangeable, and what each one does depends on
 * where it is passed:
 *
 * - An alias (`"google" | "apple" | "microsoft"`) is forwarded to the auth
 *   client, which adds an `openid` search param to the identity provider URL so
 *   the user signs in through that provider directly.
 * - Any other string is treated as a raw issuer URL and is **never** forwarded
 *   to the auth client, so it never affects how the user signs in. It is only
 *   meaningful when passed to {@link IdentityAttributesManager.requestOpenId}
 *   (or `identityAttributeKeys`), which scopes the requested keys to
 *   `openid:<issuer>:<key>`. Passed anywhere else it has no effect at all.
 */
export type IdentityAttributeOpenIdProvider =
  IdentityAttributeOpenIdProviderAlias | (string & {})

/** Session key algorithm used for each sign-in. */
export type AuthClientKeyType = "ECDSA" | "Ed25519"

/** Structural shape of an `@icp-sdk/auth` `AuthClientStorage`. */
export interface AuthClientStorageLike {
  get(key: string): Promise<string | CryptoKeyPair | null>
  set(key: string, value: string | CryptoKeyPair): Promise<void>
  remove(key: string): Promise<void>
}

/** Idle-session configuration forwarded to the underlying AuthClient. */
export interface AuthClientIdleOptions {
  /** Called once the user has been idle for `idleTimeout` ms. */
  onIdle?: () => unknown
  /** Idle timeout in ms. @default 600_000 (10 minutes) */
  idleTimeout?: number
  /** Treat scroll events as activity. @default false */
  captureScroll?: boolean
  /** Scroll debounce in ms. @default 100 */
  scrollDebounce?: number
  /** Disable idle detection entirely. @default false */
  disableIdle?: boolean
  /**
   * Disable the built-in idle callback, which signs the user out and reloads
   * the page. @default false
   */
  disableDefaultIdleCallback?: boolean
}

export interface AuthenticationClientOptions {
  /** Identity provider URL. @default "https://id.ai/authorize" */
  identityProvider?: string | URL
  /** `window.open` features string for the identity provider popup. */
  windowOpenerFeatures?: string
  /**
   * Provider for one-click sign-in.
   *
   * Only the `"google" | "apple" | "microsoft"` aliases reach the auth client.
   * Any other value is dropped here and has **no effect** — raw issuer URLs are
   * only meaningful on `requestOpenId`, where they scope the requested keys.
   * @see {@link IdentityAttributeOpenIdProvider}
   */
  openIdProvider?: IdentityAttributeOpenIdProvider
  /**
   * Derivation origin for the identity provider.
   *
   * Required when the app is served from more than one origin (e.g. a custom
   * domain plus `<canisterId>.icp0.io`) and every origin must resolve to the
   * same principal.
   * @see https://github.com/dfinity/internet-identity/blob/main/docs/internet-identity-spec.adoc
   */
  derivationOrigin?: string | URL
  /** Persistent storage backend. @default IndexedDB */
  storage?: AuthClientStorageLike
  /**
   * Session key algorithm. Use `"Ed25519"` when the storage backend cannot
   * hold a `CryptoKey`. @default "ECDSA"
   */
  keyType?: AuthClientKeyType
  /**
   * Idle timeout configuration. Pass `{ disableIdle: true }` to opt out of the
   * default behaviour, which signs the user out and reloads after 10 minutes.
   */
  idleOptions?: AuthClientIdleOptions
  /** An existing identity to authenticate via delegation. */
  identity?: SignIdentity | PartialIdentity
  /**
   * How the client talks to the identity provider. `"redirect"` requires
   * `@icp-sdk/auth` v8 or later and is ignored by older versions.
   * @default "window"
   */
  transport?: "window" | "redirect"
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

export interface RequestIdentityAttributesParameters extends AuthenticationClientOptions {
  keys: string[]
  nonce: IdentityAttributeNonce
  /**
   * Sign in as part of the same identity-provider interaction.
   * @default true
   */
  signIn?: boolean
  maxTimeToLive?: bigint
  targets?: Principal[]
}

export interface RequestOpenIdIdentityAttributesParameters extends Omit<
  RequestIdentityAttributesParameters,
  "openIdProvider"
> {
  /**
   * Provider the requested `keys` are scoped to, producing
   * `openid:<issuer>:<key>`.
   *
   * Passing one of the `"google" | "apple" | "microsoft"` aliases additionally
   * routes sign-in through that provider, so the user grants attribute access
   * in the same step. A raw issuer URL only scopes the keys.
   * @see {@link IdentityAttributeOpenIdProvider}
   */
  openIdProvider: IdentityAttributeOpenIdProvider
}

/**
 * Structural subset of `@icp-sdk/auth`'s `AuthClient` that IC Reactor relies
 * on. Declared locally so `@icp-sdk/auth` stays an optional peer dependency.
 */
export interface AuthClientLike {
  getIdentity(): Promise<Identity> | Identity
  isAuthenticated(): Promise<boolean> | boolean
  signIn(options?: AuthClientSignInOptions): Promise<Identity>
  signOut(options?: { returnTo?: string }): Promise<void>
  requestAttributes(params: {
    keys: string[]
    // Widened across `@icp-sdk/auth` v7 (value or promise) and v8 (thunk).
    // Method-shorthand parameters are bivariant, so both real signatures are
    // assignable to this one.
    nonce: Uint8Array | Promise<Uint8Array> | (() => Promise<Uint8Array>)
  }): Promise<SignedIdentityAttributes>
  /** Present from `@icp-sdk/auth` v8; used to detect the nonce contract. */
  memoize?<T>(produce: () => T | Promise<T>): Promise<T>
}

export interface AuthState {
  identity: Identity | null
  isAuthenticating: boolean
  isAuthenticated: boolean
  error: Error | undefined
}
