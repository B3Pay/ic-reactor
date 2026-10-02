/**
 * Type tests for `createTestAuth` and the fault hooks of `createFakeReplica`.
 * `pnpm typecheck` compiles this file, so each `@ts-expect-error` below is an
 * assertion that the line after it does not compile.
 */
import type { Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { createFakeReplica, createTestAuth } from "../src/testing/index.js"

/**
 * The interface `createClient`'s `auth` option takes (IR1, #779), written as
 * its design states it: what an `@icp-sdk/auth` 10 `AuthClient` satisfies. A
 * test auth has to satisfy it with no adapter.
 */
interface AuthLike {
  getPrincipal(): { toText(): string } | undefined
  getStatus(): {
    state: "signed-in" | "signed-in-elsewhere" | "expired" | "signed-out"
  }
  getIdentity(): Promise<Identity>
  subscribe(listener: () => void): () => void
  signIn(options?: unknown): Promise<unknown>
  signOut(options?: unknown): Promise<unknown>
  dispose?(): void
}

export const auth: AuthLike = createTestAuth()

const testAuth = createTestAuth({ seed: 2 })
const identity = Ed25519KeyIdentity.generate()

// Who signs in is named by an identity or a seed, never both, and a seed is a number.
createTestAuth({ identity })
createTestAuth({ seed: 3, signedIn: false })
// @ts-expect-error an identity and a seed name who signs in twice
createTestAuth({ identity, seed: 1 })
// @ts-expect-error a seed is a number
createTestAuth({ seed: "1" })

// Anyone is switched to by an identity or a seed.
testAuth.switchTo(3)
testAuth.switchTo(identity)
// @ts-expect-error switching to nobody is signOut()
testAuth.switchTo()
// @ts-expect-error a seed is a number
void testAuth.signIn("1")

// A status names a principal only in the states that have one.
const status = testAuth.getStatus()
// @ts-expect-error signed-out has no principal
status.principal.toText()
if (status.state !== "signed-out") {
  status.principal.toText()
  status.expiresAtMs.toFixed()
}
if (status.state === "signed-out") {
  // @ts-expect-error signed-out has no expiry
  void status.expiresAtMs
}

const replica = createFakeReplica()

// A reject code is one the interface specification defines, and a refusal an
// HTTP status number.
replica.reject(4, "no")
// @ts-expect-error 0 is not a reject code
replica.reject(0)
// @ts-expect-error 7 is not a reject code
replica.reject(7)
replica.refuseNext(429)
replica.refuseNext(503, 2)
// @ts-expect-error a status is a number
replica.refuseNext("429")

// `reject` never returns, so a handler can end with it.
createFakeReplica({
  canisters: {
    "rdmx6-jaaaa-aaaaa-aaadq-cai": {
      update: () => replica.reject(5),
      query: (): Uint8Array => replica.reject(1),
    },
  },
})
