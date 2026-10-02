/**
 * The test double for the react-wallet task's `WalletAuth` (declared in the
 * task's protected `src/auth.ts`, identical in every condition). It stands
 * where an Internet Identity `AuthClient` adapter stands in the app: signing
 * in installs the login identity, signing out installs the anonymous one, and
 * `switchTo` models an account switch that happens without a sign-out in
 * between (another tab, a renewed session for another anchor).
 *
 * One instance per test file, as one adapter per app: `reset` starts the next
 * test with a new login identity and notifies subscribers, so an app that keeps
 * its client at module scope, bound to the auth it was first given, keeps
 * working across tests. Every member is a closure, so it works unbound
 * (`useSyncExternalStore(auth.subscribe, auth.getIdentity)`).
 */
import type { Identity } from "@icp-sdk/core/agent"
import { AnonymousIdentity } from "@icp-sdk/core/agent"

export interface FakeWalletAuth {
  getIdentity(): Identity
  isAuthenticated(): boolean
  login(): Promise<void>
  logout(): Promise<void>
  subscribe(listener: () => void): () => void
  /** An external account switch: no sign-out in between. */
  switchTo(identity: Identity): void
  /** Start over with a new login identity, signed in or not. */
  reset(loginIdentity: Identity, options?: { signedIn?: boolean }): void
}

export function createFakeAuth(
  loginIdentity: Identity,
  options: { signedIn?: boolean } = {}
): FakeWalletAuth {
  let login = loginIdentity
  let signedIn = options.signedIn ?? false
  let identity: Identity = signedIn ? login : new AnonymousIdentity()
  const listeners = new Set<() => void>()
  const set = (next: Identity, nextSignedIn: boolean) => {
    identity = next
    signedIn = nextSignedIn
    for (const listener of [...listeners]) listener()
  }
  return {
    getIdentity: () => identity,
    isAuthenticated: () => signedIn,
    login: async () => {
      await Promise.resolve()
      set(login, true)
    },
    logout: async () => {
      await Promise.resolve()
      set(new AnonymousIdentity(), false)
    },
    switchTo: (next) => set(next, true),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reset: (nextLogin, opts = {}) => {
      login = nextLogin
      const nextSignedIn = opts.signedIn ?? false
      set(nextSignedIn ? nextLogin : new AnonymousIdentity(), nextSignedIn)
    },
  }
}
