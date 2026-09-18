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
 * Which canister a v9+ client should pair with the configured
 * `identityProvider` URL, as `AuthenticationManager` works it out.
 *
 * - `mainnet`: the URL is mainnet's and nothing overrides the canister, so the
 *   option is omitted and the client uses mainnet for both halves.
 * - `pair`: the canister is known, from `internetIdentityId` or because the URL
 *   is one IC Reactor derived for a local deployment.
 * - `unknown`: a URL the caller configured with no canister to go with it.
 */
export type IdentityProviderPairing =
  | { kind: "mainnet" }
  | { kind: "pair"; canisterId: string }
  | { kind: "unknown" }

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
 * Detects the contract of a client the caller built and passed in.
 *
 * Such a client never goes through the module loader, so there is no
 * constructor to hand {@link detectAuthClientFlavor}. The markers are the same
 * two methods, reached through the instance instead of the prototype.
 */
export function detectAuthClientInstanceFlavor(
  client: unknown
): AuthClientFlavor {
  const instance = client as Record<string, unknown> | undefined

  return typeof instance?.getStatus === "function" &&
    typeof instance?.getPrincipal === "function"
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
    "`idleOptions` was removed in v9+: the idle timeout belongs to the identity provider canister. Pass `maxTimeToIdle` to `login()` instead, and set `disableBrowserActivity` in the AuthenticationManager options to stop the client watching the browser.",
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
 * On `legacy` the object is already the right shape and is returned as-is,
 * except for `disableBrowserActivity`. That option exists only on v10, so it is
 * dropped with a one-time warning rather than handed to a v8 client that
 * ignores it.
 *
 * On `session` the identity provider becomes a pair. The canister is not
 * derived from the URL, because v9+ is explicit that the origin serving a
 * ceremony is not a promise about which canister mints there. `pairing` says
 * which canister goes with the URL. When nothing does, this throws rather than
 * guessing: a guessed canister sends the delegation calls to a different
 * deployment than the one the user signs in at, and sign-in fails later with an
 * error that names neither.
 *
 * @param options - IC Reactor's resolved options, in the v8-shaped contract.
 * @param flavor - The contract the installed client accepts.
 * @param pairing - Which canister goes with `options.identityProvider`.
 */
export function toAuthClientConstructorOptions(
  options: AuthenticationClientOptions | undefined,
  flavor: AuthClientFlavor,
  pairing: IdentityProviderPairing = { kind: "unknown" }
): AuthenticationClientOptions | Record<string, unknown> | undefined {
  if (!options) {
    return options
  }

  if (flavor === "legacy") {
    if (options.disableBrowserActivity === undefined) {
      return options
    }
    warnOnce(
      "constructor:disableBrowserActivity",
      "`disableBrowserActivity` needs @icp-sdk/auth v10 and is ignored by v8, which has no equivalent. On v8, `idleOptions` controls idle handling."
    )
    const { disableBrowserActivity: _disableBrowserActivity, ...legacy } =
      options
    return legacy
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
    if (pairing.kind === "unknown") {
      throw new Error(
        `[ic-reactor] identityProvider ${String(identityProvider)} needs internetIdentityId with @icp-sdk/auth v10, which names a provider by its authorize URL and the canister that mints its delegations. Set internetIdentityId to the canister that serves that URL.`
      )
    }
    // An absent option is how v9+ says "both values are mainnet's".
    if (pairing.kind === "pair") {
      translated.identityProvider = {
        authorizeUrl: identityProvider,
        canisterId: pairing.canisterId,
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
 *
 * `maxTimeToIdle` goes the other way. It exists only on v10, so a v10 client
 * receives it, and a v8 client, whose sign-in has no idle limit, gets it
 * dropped with a one-time warning.
 */
export function toAuthClientSignInOptions(
  options: AuthClientSignInOptions | undefined,
  flavor: AuthClientFlavor
): AuthClientSignInOptions | undefined {
  if (!options) {
    return options
  }

  if (flavor === "legacy") {
    if (options.maxTimeToIdle === undefined) {
      return options
    }
    warnOnce(
      "signIn:maxTimeToIdle",
      "`maxTimeToIdle` needs @icp-sdk/auth v10 and is ignored by v8, whose sign-in has no idle limit. On v8, set `idleOptions` instead."
    )
    const { maxTimeToIdle: _maxTimeToIdle, ...legacy } = options
    return legacy
  }

  const { targets, ...carried } = options

  if (targets !== undefined) {
    // Every time, not once: each sign-in that passes `targets` receives a
    // delegation broader than it asked for, and a warning spent on an earlier
    // one says nothing about this one.
    console.warn(
      "[ic-reactor] `targets` was removed in @icp-sdk/auth v9+ and is ignored: the delegation you receive is NOT restricted to those canisters. The identity provider scopes a session to the application canister instead. Remove `targets`, or pin @icp-sdk/auth to ^8 if you depend on canister-scoped delegations."
    )
  }

  return carried
}
