/**
 * What every case needs: the local replica `global-setup.ts` found, the
 * deployed `hello_actor`, and Ed25519 identities to call as.
 */
import type { AuthLike, ReactorError } from "@ic-reactor/core"
import { isReactorError } from "@ic-reactor/core"
import type { Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { inject } from "vitest"

export const replica = inject("replica")

/** The local replica, its root key left to the client (fetched: the host is local). */
export const network = { host: replica.host } as const

/** `hello_actor` by id. */
export const target = { id: replica.canisterId } as const

export const ANONYMOUS = "2vxsx-fae"

/** A fresh Ed25519 identity: each case calls as principals no other case uses. */
export const ed25519 = (): Identity => Ed25519KeyIdentity.generate()

/**
 * A sign-in that is always signed in, as whichever identity `switchTo` last
 * named, and tells the client each time it changes.
 */
export function switchableAuth(first: Identity): {
  auth: AuthLike
  switchTo(next: Identity): void
} {
  let current = first
  const listeners = new Set<() => void>()
  const auth: AuthLike = {
    getPrincipal: () => current.getPrincipal(),
    getStatus: () => ({ state: "signed-in" }),
    getIdentity: async () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signIn: async () => undefined,
    signOut: async () => undefined,
  }
  return {
    auth,
    switchTo(next) {
      current = next
      for (const listener of listeners) listener()
    },
  }
}

/** The `ReactorError` `promise` rejects with; fails the case when it resolves or rejects with anything else. */
export async function rejection(
  promise: Promise<unknown>
): Promise<ReactorError<unknown>> {
  let value: unknown
  try {
    value = await promise
  } catch (error) {
    if (isReactorError(error)) return error
    throw new Error(`expected a ReactorError, got ${String(error)}`, {
      cause: error,
    })
  }
  throw new Error(
    `expected a ReactorError, but the call resolved with ${String(value)}`
  )
}
