/**
 * Which `AuthenticationManager` a `defineReactor` or `defineDisplayReactor`
 * result uses, for `createReactorProvider` to dispose. Not part of the public
 * API.
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

/**
 * Records how to read the manager `owner` uses, once it has one.
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
 * The manager a registered result uses, or `undefined` for one that has not
 * built one yet and for anything that was never registered.
 *
 * @internal
 */
export function authenticationOf(
  owner: object
): AuthenticationManager | undefined {
  return readers.get(owner)?.()
}
