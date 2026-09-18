/**
 * Bridges IC Reactor's stable authentication options onto whichever
 * `@icp-sdk/auth` major is installed.
 *
 * `@icp-sdk/auth` v9 reshaped the `AuthClient` constructor and v10 moved its
 * `@icp-sdk/core` peer to `^6`. The *method* surface IC Reactor calls --
 * `signIn`, `signOut`, `getIdentity`, `isAuthenticated`, `requestAttributes`,
 * `memoize` -- is byte-identical across v8 and v10, so only the option objects
 * handed to the constructor and to `signIn` have to be translated.
 *
 * The translation lives here rather than in `AuthenticationManager` so that
 * {@link AuthenticationClientOptions} stays IC Reactor's own contract. Callers
 * keep writing `identityProvider: "https://id.ai/authorize"` whichever peer
 * they installed, and the shapes diverge only at the boundary.
 *
 * Why both majors: v8 peers `@icp-sdk/core@^5` while IC Reactor needs `^6`, so
 * a strict `npm install` resolving v8 fails with `ERESOLVE` unless the app adds
 * an `overrides` block. v10 is the first release whose peer is `^6`, which
 * removes that workaround -- but pinning v10 alone would break every app
 * already installed on v8.
 */
import type {
  AuthClientSignInOptions,
  AuthenticationClientOptions,
} from "./types.js"
import { LOCAL_INTERNET_IDENTITY_CANISTER_ID } from "./constants.js"

/**
 * Which options contract the installed `AuthClient` accepts.
 *
 * - `legacy` -- v8. `identityProvider` is a URL; `storage`, `keyType`,
 *   `idleOptions` and `identity` are constructor options; `signIn` takes
 *   `targets`.
 * - `session` -- v9/v10. `identityProvider` is an `{ authorizeUrl, canisterId }`
 *   pair, credentials moved behind `credentialStorage`, idle moved to the
 *   identity provider canister, and `signIn` no longer takes `targets`.
 */
export type AuthClientFlavor = "legacy" | "session"

/** The `{ authorizeUrl, canisterId }` pair a v9+ client names a deployment by. */
export interface SessionIdentityProvider {
  authorizeUrl: string | URL
  canisterId: string
}

/**
 * Detects the contract from the constructor itself rather than from the
 * module's exports.
 *
 * `getStatus`, `getPrincipal`, `subscribe` and `dispose` were added to
 * `AuthClient` in v9 and have no v8 counterpart. Reading them off the prototype
 * beats sniffing the module namespace: a bundler may drop an unreferenced named
 * export (`IdbStorage`, `IdleManager`) from the namespace object it synthesizes
 * for a dynamic import, but it never drops a class's own methods.
 *
 * Two markers rather than one, because a single name is a coincidence away from
 * matching some future shim. An unrecognised constructor is treated as `legacy`
 * -- the shape IC Reactor's own options already mirror, so a wrong guess there
 * passes the values through untouched instead of rewriting them into a shape
 * nothing understands.
 */
export function detectAuthClientFlavor(AuthClient: unknown): AuthClientFlavor {
  const prototype = (AuthClient as { prototype?: Record<string, unknown> })
    ?.prototype

  if (!prototype) {
    return "legacy"
  }

  return typeof prototype.getStatus === "function" &&
    typeof prototype.getPrincipal === "function"
    ? "session"
    : "legacy"
}

/**
 * Options a `session`-era client drops on the floor, and what replaced them.
 *
 * Each is a real capability in v8 with no v9+ constructor equivalent, so the
 * only honest thing to do is say so rather than pass a key that is ignored.
 */
const DROPPED_CONSTRUCTOR_OPTIONS: Record<string, string> = {
  storage:
    "`storage` (an AuthClientStorage) has no v9+ equivalent: credentials moved behind `credentialStorage`, whose store also generates identities and holds a delegation alongside each key, so an AuthClientStorage cannot be adapted into one. Construct the client yourself and pass it as `authClient` to keep a custom store.",
  keyType:
    "`keyType` was removed in v9+: the credential store decides the key type, because a store that has to serialise needs an extractable key and one that does not should not hold one.",
  idleOptions:
    "`idleOptions` was removed in v9+: the idle timeout belongs to the identity provider canister. Pass `maxTimeToIdle` to `login()` instead, and use `disableBrowserActivity` to stop the client watching the browser.",
  identity:
    "`identity` was removed from v9+ constructor options: the agent signs as the session rather than as an identity handed in at construction.",
}

/** Emits each distinct warning once per process, so a render loop cannot spam. */
const warned = new Set<string>()

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[ic-reactor] ${message}`)
}

/** @internal Test seam -- lets a suite assert the first warning every time. */
export function resetAuthCompatWarnings() {
  warned.clear()
}

/**
 * Translates IC Reactor's constructor options into the installed client's shape.
 *
 * On `legacy` the object is already the right shape and is returned as-is.
 *
 * On `session` the identity provider becomes a pair. The canister is not
 * derived from the URL -- v9+ is explicit that the origin serving a ceremony is
 * not a promise about which canister mints there -- so it comes from the
 * `internetIdentityId` the manager already tracks, falling back to the
 * well-known Internet Identity id that both mainnet and a conventional local
 * deployment use.
 *
 * @param options - IC Reactor's resolved options, in the v8-shaped contract.
 * @param flavor - The contract the installed client accepts.
 * @param internetIdentityId - Canister that mints this app's delegations.
 * @param isDefaultProvider - Whether `identityProvider` is the untouched
 *   mainnet default. When it is and no canister was configured, the option is
 *   omitted entirely: v9+ reads an absent `identityProvider` as "both values
 *   are mainnet's", which is more accurate than restating them.
 */
export function toAuthClientConstructorOptions(
  options: AuthenticationClientOptions | undefined,
  flavor: AuthClientFlavor,
  internetIdentityId?: string,
  isDefaultProvider = false
): AuthenticationClientOptions | Record<string, unknown> | undefined {
  if (flavor === "legacy" || !options) {
    return options
  }

  // Prefixed with `_` because they are destructured only to keep them out of
  // `carried`: a v9+ constructor has no equivalent for any of them, and the
  // loop below is what actually reports each one that was set.
  const {
    identityProvider,
    storage: _storage,
    keyType: _keyType,
    idleOptions: _idleOptions,
    identity: _identity,
    ...carried
  } = options

  for (const [name, explanation] of Object.entries(
    DROPPED_CONSTRUCTOR_OPTIONS
  )) {
    if ((options as Record<string, unknown>)[name] !== undefined) {
      warnOnce(`constructor:${name}`, explanation)
    }
  }
  const translated: Record<string, unknown> = { ...carried }

  if (identityProvider !== undefined) {
    const shouldOmit = isDefaultProvider && internetIdentityId === undefined

    if (!shouldOmit) {
      translated.identityProvider = {
        authorizeUrl: identityProvider,
        canisterId: internetIdentityId ?? LOCAL_INTERNET_IDENTITY_CANISTER_ID,
      } satisfies SessionIdentityProvider
    }
  }

  return translated
}

/**
 * Translates `signIn` options into the installed client's shape.
 *
 * `targets` is the one that matters. v8 forwards it to restrict the delegation
 * to named canisters; v9+ removed it, and scoping is decided by the identity
 * provider against the app's own canister. Passing it to a v9+ client does not
 * fail -- it is simply ignored, and the delegation that comes back is broader
 * than the caller asked for. That is a security-relevant difference, so it
 * warns unconditionally rather than only in development.
 */
export function toAuthClientSignInOptions(
  options: AuthClientSignInOptions | undefined,
  flavor: AuthClientFlavor
): AuthClientSignInOptions | undefined {
  if (flavor === "legacy" || !options) {
    return options
  }

  const { targets, ...carried } = options

  if (targets !== undefined) {
    warnOnce(
      "signIn:targets",
      "`targets` was removed in @icp-sdk/auth v9+ and is ignored: the delegation you receive is NOT restricted to those canisters. The identity provider scopes a session to the application canister instead. Remove `targets`, or pin @icp-sdk/auth to ^8 if you depend on canister-scoped delegations."
    )
  }

  return carried
}
