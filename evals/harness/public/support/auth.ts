// A sign-in state for tests, with the shape of the app's WalletAuth: signing
// in installs the given identity, signing out the anonymous one, and
// `switchTo` changes the signed-in principal without a sign-out in between.
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent"

export interface TestAuth {
  getIdentity(): Identity
  isAuthenticated(): boolean
  login(): Promise<void>
  logout(): Promise<void>
  subscribe(listener: () => void): () => void
  switchTo(identity: Identity): void
}

export function createTestAuth(
  loginIdentity: Identity,
  options: { signedIn?: boolean } = {}
): TestAuth {
  let signedIn = options.signedIn ?? false
  let identity: Identity = signedIn ? loginIdentity : new AnonymousIdentity()
  const listeners = new Set<() => void>()
  const set = (next: Identity, nextSignedIn: boolean) => {
    identity = next
    signedIn = nextSignedIn
    for (const listener of [...listeners]) listener()
  }
  return {
    getIdentity: () => identity,
    isAuthenticated: () => signedIn,
    login: async () => set(loginIdentity, true),
    logout: async () => set(new AnonymousIdentity(), false),
    switchTo: (next) => set(next, true),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
