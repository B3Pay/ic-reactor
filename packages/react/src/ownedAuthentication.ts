/**
 * Which `AuthenticationManager`s a `createReactorProvider` value owns, for the
 * provider to dispose when its tree unmounts. Not part of the public API.
 *
 * A value owns the managers built for it: those constructed while its factory
 * ran, and those a `defineReactor` or `defineDisplayReactor` result in it
 * builds later, on first use. A manager built elsewhere and handed in, such as
 * an app-wide one every provider shares, belongs to whoever built it, and
 * disposing it on each remount would stop its client following the session.
 *
 * A result's `authentication` is a getter that builds the manager on first
 * read, and building one loads the optional `@icp-sdk/auth` peer in a browser.
 * A provider that read it to release the manager would build one only to
 * dispose it, for every reactor whose tree never signed in. Each result
 * registers a reader here instead, which answers without building anything.
 *
 * Kept apart from `defineReactorShared.ts` so that the provider does not pull
 * that module's reactor setup into an app that builds its reactors by hand.
 */
import type { AuthenticationManager } from "./auth/authentication-manager.js"

const readers = new WeakMap<object, () => AuthenticationManager | undefined>()

/** The managers constructed during a running {@link collectAuthentication}. */
let collecting: Set<AuthenticationManager> | undefined

/**
 * Records how to read the manager `owner` built, once it has built one.
 *
 * @internal
 */
export function registerAuthentication(
  owner: object,
  read: () => AuthenticationManager | undefined
): void {
  readers.set(owner, read)
}

/**
 * The manager a registered result built, or `undefined` for one that has not
 * built one yet, for one that was handed a manager, and for anything that was
 * never registered.
 *
 * @internal
 */
export function authenticationOf(
  owner: object
): AuthenticationManager | undefined {
  return readers.get(owner)?.()
}

/**
 * Called by each `AuthenticationManager` as it is constructed.
 *
 * @internal
 */
export function recordAuthentication(manager: AuthenticationManager): void {
  collecting?.add(manager)
}

/**
 * Runs `build` and returns what it returned, with every manager constructed
 * while it ran. `build` runs synchronously, so a server rendering several
 * requests at once cannot interleave another request's managers.
 *
 * @internal
 */
export function collectAuthentication<T>(build: () => T): {
  value: T
  built: AuthenticationManager[]
} {
  const outer = collecting
  const built = new Set<AuthenticationManager>()
  collecting = built
  try {
    const value = build()
    return { value, built: [...built] }
  } finally {
    collecting = outer
  }
}
