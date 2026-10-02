// A WalletAuth over Internet Identity, for the real app (src/main.tsx).
// Do not change this file.
import { AuthClient } from "@icp-sdk/auth/client"
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent"
import type { WalletAuth } from "./auth"

export async function createInternetIdentityAuth(): Promise<WalletAuth> {
  const client = new AuthClient()
  const listeners = new Set<() => void>()
  let identity: Identity = client.isAuthenticated()
    ? await client.getIdentity()
    : new AnonymousIdentity()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  client.subscribe(() => {
    void (async () => {
      identity = client.isAuthenticated()
        ? await client.getIdentity()
        : new AnonymousIdentity()
      notify()
    })()
  })
  return {
    getIdentity: () => identity,
    isAuthenticated: () => client.isAuthenticated(),
    async login() {
      identity = await client.signIn()
      notify()
    },
    async logout() {
      await client.signOut()
      identity = new AnonymousIdentity()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
