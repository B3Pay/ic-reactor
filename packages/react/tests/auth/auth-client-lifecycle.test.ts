/**
 * What becomes of the clients an `AuthenticationManager` builds, against the
 * **real** `@icp-sdk/auth` AuthClient, with the fake Internet Identity and fake
 * replica of `internet-identity-integration.test.ts`.
 *
 * Like that file, this one runs once per supported major (see
 * `vitest.config.ts`). It is a file of its own because v8's `IdleManager` is a
 * singleton for the module's lifetime: every v8 sign-in in a file registers its
 * idle callbacks on the same one, and a test that counts them needs a module
 * no other sign-in has touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import { QueryClient } from "@tanstack/react-query"
import * as authClientModule from "@icp-sdk/auth/client"
import { AuthClient } from "@icp-sdk/auth/client"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"
import type { AuthClientLike } from "../../src/auth/types.js"
import { detectAuthClientFlavor } from "../../src/auth/auth-client-compat.js"
import {
  installFakeIdentityProvider,
  withUserGesture,
  type FakeIdentityProvider,
} from "./fake-identity-provider.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

/** Which major this run resolved `@icp-sdk/auth` to. */
const isV10 = detectAuthClientFlavor(AuthClient) === "session"

const LOCAL_HOST = "http://localhost:4943"

let provider: FakeIdentityProvider
let replica: FakeReplica
/** Every manager a test built, so the clients they made can be released. */
const managers: AuthenticationManager[] = []

function createManager(
  params: Partial<ConstructorParameters<typeof AuthenticationManager>[0]> = {}
) {
  const clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    agentOptions: { host: LOCAL_HOST },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    ...params,
  })
  managers.push(authentication)
  return { clientManager, authentication }
}

/** Signs in, then signs in through Google, then signs in plainly again. */
async function signInThroughTwoOptionSets(
  authentication: AuthenticationManager
) {
  const clients: Array<AuthClientLike | undefined> = []
  await authentication.prepareClient()
  await withUserGesture(() => authentication.login())
  clients.push(authentication.client)
  // "Continue with Google" needs a client whose provider URL carries
  // `openid=`, so the manager builds another one for it.
  const attributes = new IdentityAttributesManager(authentication)
  await withUserGesture(() =>
    attributes.requestOpenId({
      openIdProvider: "google",
      keys: ["email"],
      nonce: new Uint8Array(32),
    })
  )
  clients.push(authentication.client)
  await withUserGesture(() => authentication.login())
  clients.push(authentication.client)
  expect(new Set(clients).size).toBe(3)
  return clients
}

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  provider = installFakeIdentityProvider()
  replica = installFakeReplica({
    host: LOCAL_HOST,
    canisters: { [provider.canisterId]: provider.canister },
  })
})

afterEach(() => {
  for (const { client } of managers.splice(0)) {
    ;(client as { dispose?: () => void } | undefined)?.dispose?.()
  }
  provider.restore()
  replica.restore()
  vi.restoreAllMocks()
})

describe("clients a manager replaces for per-call options (real AuthClient)", () => {
  // First in the file, so v8's IdleManager holds only this test's callbacks.
  it.runIf(!isV10)(
    "runs the app's onIdle once per idle period, however many clients it built (v8)",
    async () => {
      const onIdle = vi.fn()
      const { authentication } = createManager({
        idleOptions: { onIdle, idleTimeout: 60_000 },
      })
      await signInThroughTwoOptionSets(authentication)

      // What v8's IdleManager does when its timer fires: every callback the
      // clients registered, in one loop. `create()` hands back the one they
      // registered on.
      const { IdleManager } = authClientModule as unknown as {
        IdleManager: { create(): { exit(): void } }
      }
      IdleManager.create().exit()
      expect(onIdle).toHaveBeenCalledTimes(1)

      // And once on the next idle period. The one that ended tore the
      // IdleManager down, so only a client that has not registered yet, built
      // for another switch of options, registers on the next one.
      const attributes = new IdentityAttributesManager(authentication)
      await withUserGesture(() =>
        attributes.requestOpenId({
          openIdProvider: "google",
          keys: ["email"],
          nonce: new Uint8Array(32),
        })
      )
      IdleManager.create().exit()
      expect(onIdle).toHaveBeenCalledTimes(2)
    }
  )

  it.runIf(isV10)(
    "disposes each client it replaces, and not the one it uses (v10)",
    async () => {
      const dispose = vi.spyOn(AuthClient.prototype, "dispose")
      const { authentication } = createManager()

      const [first, second, third] =
        await signInThroughTwoOptionSets(authentication)

      expect(dispose.mock.contexts).toEqual([first, second])
      expect(authentication.client).toBe(third)
      // The one in use still signs the user in.
      expect(authentication.authState.isAuthenticated).toBe(true)
    }
  )

  it.runIf(isV10)("never disposes a client handed to it (v10)", async () => {
    const dispose = vi.spyOn(AuthClient.prototype, "dispose")
    const authClient = new AuthClient()
    const { authentication } = createManager({ authClient })

    // Options that would make the manager build a client of its own.
    await authentication.prepareClient({ openIdProvider: "google" })

    expect(authentication.client).toBe(authClient)
    expect(dispose).not.toHaveBeenCalled()
    authClient.dispose()
  })
})
