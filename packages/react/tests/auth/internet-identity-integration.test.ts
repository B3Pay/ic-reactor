/**
 * End-to-end Internet Identity tests against the **real** `@icp-sdk/auth`
 * AuthClient. Nothing in the auth package is mocked — only the browser
 * boundary (`window.open`) is replaced by a fake II that speaks the real
 * ICRC-29 / ICRC-34 / `ii-icrc3-attributes` wire protocol, and the network by
 * a fake replica whose certificates the real agent verifies.
 *
 * The file runs once per supported major (see `vitest.config.ts`): against
 * the `@icp-sdk/auth` devDependency (v10) and against `@icp-sdk/auth-v8`. v10
 * mints its delegation from the Internet Identity canister, so sign-in tests
 * run on a local network, where the fake replica can serve the root key the
 * minting agent trusts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { IDBFactory } from "fake-indexeddb"
import { QueryClient } from "@tanstack/react-query"
import { AuthClient } from "@icp-sdk/auth/client"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"
import { detectAuthClientFlavor } from "../../src/auth/auth-client-compat.js"
import {
  installFakeIdentityProvider,
  withUserGesture,
  encodeAttributes,
  fromBase64,
  type FakeIdentityProvider,
} from "./fake-identity-provider.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

/** Which major this run resolved `@icp-sdk/auth` to. */
const isV10 = detectAuthClientFlavor(AuthClient) === "session"

const LOCAL_HOST = "http://localhost:4943"

let provider: FakeIdentityProvider
let replica: FakeReplica

function createManager(
  params: Partial<ConstructorParameters<typeof AuthenticationManager>[0]> = {},
  { network = "local" }: { network?: "local" | "mainnet" } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const clientManager = new ClientManager({
    queryClient,
    agentOptions:
      network === "local"
        ? { host: LOCAL_HOST }
        : { host: "https://icp-api.io", shouldFetchRootKey: false },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    ...params,
  })
  return { queryClient, clientManager, authentication }
}

beforeEach(() => {
  localStorage.clear()
  // v10 keeps its credentials in IndexedDB, and a session left there by the
  // previous test would be restored into this one.
  globalThis.indexedDB = new IDBFactory()
  provider = installFakeIdentityProvider()
  replica = installFakeReplica({
    host: LOCAL_HOST,
    canisters: { [provider.canisterId]: provider.canister },
  })
})

afterEach(() => {
  provider.restore()
  replica.restore()
})

describe("Internet Identity sign-in (real AuthClient)", () => {
  it("signs in through the II popup and puts the delegated identity on the agent", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()

    await withUserGesture(() => authentication.login())

    expect(provider.openCount).toBe(1)
    expect(provider.signInRequestCount).toBe(1)

    const { identity, isAuthenticated, isAuthenticating, error } =
      authentication.authState
    expect(error).toBeUndefined()
    expect(isAuthenticating).toBe(false)
    expect(isAuthenticated).toBe(true)
    expect(identity).not.toBeNull()

    // The agent must carry the delegated principal, not the anonymous one.
    const principal = identity!.getPrincipal()
    expect(principal.isAnonymous()).toBe(false)
    expect((await clientManager.getUserPrincipal()).toText()).toBe(
      principal.toText()
    )
    expect(principal.toText()).toBe(
      provider.rootIdentity.getPrincipal().toText()
    )
  })

  it("opens the popup synchronously so the browser gesture chain survives", async () => {
    // `PostMessageTransport` rejects when `establishChannel` runs outside a
    // click. A regression that awaits before `signIn()` fails here.
    const { authentication } = createManager()
    await authentication.prepareClient()

    await expect(
      withUserGesture(() => authentication.login())
    ).resolves.toBeUndefined()
  })

  it("forwards maxTimeToLive to the identity provider", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    const maxTimeToLive = 3_600_000_000_000n
    await withUserGesture(() => authentication.login({ maxTimeToLive }))

    const request = isV10
      ? provider.sessionRequests[0]
      : provider.delegationRequests[0]
    expect(request.maxTimeToLive).toBe(maxTimeToLive.toString())
  })

  it.runIf(!isV10)("forwards targets to the identity provider", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    await withUserGesture(() =>
      authentication.login({
        targets: [Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai")],
      })
    )

    expect(provider.delegationRequests[0].targets).toEqual([
      "rrkah-fqaaa-aaaaa-aaaaq-cai",
    ])
  })

  it.runIf(isV10)(
    "forwards maxTimeToIdle to the identity provider",
    async () => {
      const { authentication } = createManager()
      await authentication.prepareClient()

      const maxTimeToIdle = 600_000_000_000n
      await withUserGesture(() => authentication.login({ maxTimeToIdle }))

      expect(provider.sessionRequests[0].maxTimeToIdle).toBe(
        maxTimeToIdle.toString()
      )
    }
  )

  it.runIf(isV10)(
    "mints the app delegation from the Internet Identity canister as the session",
    async () => {
      const { authentication } = createManager()
      await authentication.prepareClient()

      await withUserGesture(() => authentication.login())

      expect(replica.methodsCalled(provider.canisterId)).toEqual(
        expect.arrayContaining(["app_prepare_delegation", "app_get_delegation"])
      )
      // Signed as the session the popup issued, not as the account or as
      // nobody: the canister would refuse either.
      const mint = replica.requests.find(
        (request) => request.methodName === "app_prepare_delegation"
      )
      expect(mint?.caller).toBeDefined()
      expect(mint?.caller).not.toBe(Principal.anonymous().toText())
      expect(mint?.caller).not.toBe(
        provider.rootIdentity.getPrincipal().toText()
      )
    }
  )

  it("runs onSuccess after a completed sign-in", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    const calls: string[] = []
    await withUserGesture(() =>
      authentication.login({
        onSuccess: () => {
          calls.push("success")
        },
        onError: () => {
          calls.push("error")
        },
      })
    )

    expect(calls).toEqual(["success"])
  })

  it("restores the session on a fresh manager without reopening the popup", async () => {
    const first = createManager()
    await first.authentication.prepareClient()
    await withUserGesture(() => first.authentication.login())
    expect(provider.openCount).toBe(1)

    // A new page load: new ClientManager + AuthenticationManager, same storage.
    const second = createManager()
    const identity = await second.authentication.authenticate()

    expect(provider.openCount).toBe(1)
    expect(identity).toBeDefined()
    expect(identity!.getPrincipal().isAnonymous()).toBe(false)
    expect(second.authentication.authState.isAuthenticated).toBe(true)
    expect((await second.clientManager.getUserPrincipal()).toText()).toBe(
      first.authentication.authState.identity!.getPrincipal().toText()
    )
  })

  it("logs out, clears the session and resets the agent to anonymous", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(false)

    await authentication.logout()

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)

    // The stored session must be gone: a fresh manager stays anonymous.
    const next = createManager()
    const identity = await next.authentication.authenticate()
    expect(identity?.getPrincipal().isAnonymous()).toBe(true)
    expect(next.authentication.authState.isAuthenticated).toBe(false)
  })

  it.runIf(isV10)(
    "revokes the session at the Internet Identity canister on logout",
    async () => {
      const { authentication } = createManager()
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const session = replica.requests.find(
        (request) => request.methodName === "app_prepare_delegation"
      )?.caller

      await authentication.logout()

      expect(provider.revokedSessions).toEqual([session])
    }
  )

  it.runIf(isV10)(
    "signs out here even when revoking the session at the canister fails",
    async () => {
      // v10 wipes the device and drops to an anonymous identity before it
      // rethrows a revoke the canister refused. IC Reactor has to follow it
      // rather than keep signing as the account the user just left (#478).
      const { authentication, clientManager } = createManager()
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      provider.setRevokeError("stable memory is full")

      await expect(authentication.logout()).rejects.toThrow(
        "stable memory is full"
      )

      expect(authentication.authState.isAuthenticated).toBe(false)
      expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
      expect(authentication.authState.error?.message).toContain(
        "stable memory is full"
      )
      // The device holds nothing any more: a fresh manager stays anonymous.
      const next = createManager()
      const identity = await next.authentication.authenticate()
      expect(identity?.getPrincipal().isAnonymous()).toBe(true)
    }
  )

  it("reports sign-in failures through authState and onError", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    // Popup blocked.
    provider.restore()
    const blocked = () => null as unknown as Window
    const original = window.open
    window.open = blocked as unknown as typeof window.open

    const errors: Array<string | undefined> = []
    await expect(
      withUserGesture(() =>
        authentication.login({ onError: (e) => void errors.push(e) })
      )
    ).rejects.toThrow()

    window.open = original
    expect(authentication.authState.isAuthenticating).toBe(false)
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(authentication.authState.error).toBeInstanceOf(Error)
    expect(errors).toHaveLength(1)
  })
})

describe("identity provider resolution", () => {
  // These only check which URL the popup opens at. The fake refuses the
  // sign-in once it is open: on mainnet a v10 client would go on to mint from
  // mainnet's canister, which no fake can certify for.
  beforeEach(() => {
    provider.setSignInError({ code: 3000, message: "User rejected" })
  })

  it("uses the production II provider on mainnet", async () => {
    const { authentication } = createManager({}, { network: "mainnet" })
    await authentication.prepareClient()
    await expect(withUserGesture(() => authentication.login())).rejects.toThrow(
      "User rejected"
    )

    expect(provider.openedUrls[0]).toBe("https://id.ai/authorize")
  })

  it("uses the local II canister's provider on a local network", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()
    await expect(withUserGesture(() => authentication.login())).rejects.toThrow(
      "User rejected"
    )

    expect(provider.openedUrls[0]).toBe(
      `http://${provider.canisterId}.localhost:4943/authorize`
    )
  })

  it("explains a local II with no sign-in page for the installed major", async () => {
    // The build the v8 advice names serves /authorize but predates the calls a
    // v10 sign-in makes, so a v10 app needs the frontend served separately.
    provider.setSignInPageServed(false)
    const { authentication } = createManager()

    await expect(authentication.prepareClient()).rejects.toThrow(
      isV10
        ? "needs an Internet Identity frontend served separately"
        : "Install internet_identity_dev.wasm from release-2026-03-16"
    )
    expect(provider.openCount).toBe(0)
  })

  it("honours an explicit identityProvider", async () => {
    const { authentication } = createManager(
      {
        identityProvider: "https://identity.internetcomputer.org/authorize",
        // v10 names a provider by its URL and the canister that mints for it,
        // and refuses a URL on its own. v8 ignores this.
        internetIdentityId: provider.canisterId,
      },
      { network: "mainnet" }
    )
    await authentication.prepareClient()
    await expect(withUserGesture(() => authentication.login())).rejects.toThrow(
      "User rejected"
    )

    expect(provider.openedUrls[0]).toBe(
      "https://identity.internetcomputer.org/authorize"
    )
  })

  it("adds the openid search param for one-click providers", async () => {
    const { authentication } = createManager({}, { network: "mainnet" })
    await authentication.prepareClient({ openIdProvider: "google" })
    await expect(
      withUserGesture(() => authentication.login({ openIdProvider: "google" }))
    ).rejects.toThrow("User rejected")

    expect(provider.openedUrls[0]).toContain(
      "openid=https%3A%2F%2Faccounts.google.com"
    )
  })
})

describe("identity attributes (real AuthClient)", () => {
  it("requests attributes and decodes them alongside sign-in", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    const nonce = new Uint8Array(32).fill(7)
    const result = await withUserGesture(() =>
      attributes.request({
        keys: [
          "openid:https://accounts.google.com:email",
          "openid:https://accounts.google.com:name",
        ],
        nonce,
      })
    )

    // Sign-in and the attribute request share one popup.
    expect(provider.openCount).toBe(1)
    expect(provider.attributesRequests).toHaveLength(1)
    expect(fromBase64(provider.attributesRequests[0].nonce)).toEqual(nonce)

    expect(result.decodedAttributes).toEqual({
      email: "user@example.com",
      name: "Test User",
    })
    expect(result.principal).toBe(provider.rootIdentity.getPrincipal().toText())
    expect(result.signedAttributes.signature).toEqual(
      new Uint8Array([1, 2, 3, 4])
    )
    expect(authentication.authState.isAuthenticated).toBe(true)
  })

  it("scopes keys for requestOpenId", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    provider.setAttributesResponse({
      data: encodeAttributes([
        ["openid:https://accounts.google.com:email", "scoped@example.com"],
      ]),
      signature: new Uint8Array([9]),
    })

    const result = await withUserGesture(() =>
      attributes.requestOpenId({
        nonce: new Uint8Array(32).fill(3),
        openIdProvider: "google",
        keys: ["email"],
      })
    )

    expect(provider.attributesRequests[0].keys).toEqual([
      "openid:https://accounts.google.com:email",
    ])
    expect(result.decodedAttributes.email).toBe("scoped@example.com")
  })

  it("opens the II window before an async nonce resolves", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    // A nonce fetched from a canister: awaiting it before calling
    // requestAttributes would end the user gesture and the transport would
    // refuse to open the window.
    let releaseNonce: (value: Uint8Array) => void = () => {}
    const nonce = new Promise<Uint8Array>((resolve) => {
      releaseNonce = resolve
    })

    const pending = withUserGesture(() =>
      attributes.request({
        keys: ["openid:https://accounts.google.com:email"],
        nonce: () => nonce,
      })
    )

    // The popup is already up while the nonce is still in flight.
    await Promise.resolve()
    expect(provider.openCount).toBe(1)

    releaseNonce(new Uint8Array(32).fill(5))
    const result = await pending

    expect(fromBase64(provider.attributesRequests[0].nonce)).toEqual(
      new Uint8Array(32).fill(5)
    )
    expect(result.decodedAttributes.email).toBe("user@example.com")
  })

  describe("a sign-out while the attribute request is still pending", () => {
    // Signing out ends neither half of a pending request: the attribute side
    // goes on and resolves. The identity it captured belongs to the session
    // the user just left, and committing it put their delegation back on the
    // agent while the app showed them signed out.

    /** A nonce the test releases, so the request stays pending until then. */
    function heldNonce() {
      let release: () => void = () => {}
      const nonce = new Promise<Uint8Array>((resolve) => {
        release = () => resolve(new Uint8Array(32).fill(4))
      })
      return { nonce: () => nonce, release }
    }

    async function expectSignedOut(
      authentication: AuthenticationManager,
      clientManager: ClientManager
    ) {
      expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
      expect(authentication.authState.isAuthenticated).toBe(false)
      expect(
        authentication.authState.identity?.getPrincipal().isAnonymous() ?? true
      ).toBe(true)
      expect(authentication.authState.isAuthenticating).toBe(false)
    }

    it("keeps the agent anonymous for a request made while signed in", async () => {
      const { authentication, clientManager } = createManager()
      const attributes = new IdentityAttributesManager(authentication)
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const { nonce, release } = heldNonce()

      const pending = withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce, signIn: false })
      )
      await authentication.logout()
      await expectSignedOut(authentication, clientManager)

      release()
      await pending

      await expectSignedOut(authentication, clientManager)
    })

    it("keeps the agent anonymous when the request's own sign-in had finished", async () => {
      const { authentication, clientManager } = createManager()
      const attributes = new IdentityAttributesManager(authentication)
      await authentication.prepareClient()
      const { nonce, release } = heldNonce()

      const pending = withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce })
      )
      await vi.waitFor(async () => {
        expect(await authentication.client!.isAuthenticated()).toBe(true)
      })
      await authentication.logout()

      release()
      await pending

      await expectSignedOut(authentication, clientManager)
    })

    /**
     * Signs out in another tab: a manager of its own restores the session from
     * the storage both tabs share and logs out. A browser then raises `storage`
     * in every other tab of the origin; jsdom has one window and raises none,
     * so this tab is sent what changed.
     */
    async function signOutInAnotherTab() {
      const before = readLocalStorage()
      const otherTab = createManager()
      await otherTab.authentication.authenticate()
      expect(otherTab.authentication.authState.isAuthenticated).toBe(true)
      await otherTab.authentication.logout()
      const after = readLocalStorage()

      for (const key of new Set([...before.keys(), ...after.keys()])) {
        const oldValue = before.get(key) ?? null
        const newValue = after.get(key) ?? null
        if (oldValue === newValue) continue
        window.dispatchEvent(
          new StorageEvent("storage", { key, oldValue, newValue })
        )
      }
    }

    function readLocalStorage() {
      const entries = new Map<string, string>()
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key !== null) entries.set(key, localStorage.getItem(key)!)
      }
      return entries
    }

    it("signs this tab out too when the sign-out happens in another tab", async () => {
      // Nothing tells the manager: the client in this tab stops vouching for
      // the session while still handing out its identity, and the request is
      // the first thing to find out.
      const { authentication, clientManager } = createManager()
      const attributes = new IdentityAttributesManager(authentication)
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const { nonce, release } = heldNonce()

      const pending = withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce, signIn: false })
      )
      await signOutInAnotherTab()
      expect(await authentication.client!.isAuthenticated()).toBe(false)

      release()
      await pending

      await expectSignedOut(authentication, clientManager)
    })
  })

  it("surfaces identity-provider errors", async () => {
    const { authentication } = createManager()
    const attributes = new IdentityAttributesManager(authentication)
    await authentication.prepareClient()

    provider.setAttributesError({ code: 3000, message: "User rejected" })

    await expect(
      withUserGesture(() =>
        attributes.request({ keys: ["email"], nonce: new Uint8Array(32) })
      )
    ).rejects.toThrow("User rejected")

    expect(authentication.authState.error?.message).toContain("User rejected")
    expect(authentication.authState.isAuthenticating).toBe(false)
  })
})

describe("fake identity provider", () => {
  // After a sign-in the signer's heartbeat has a 2 s disconnect timeout
  // pending, and its callback removes the heartbeat's listener from `window`.
  // One still pending when a test file ends fires after vitest has removed the
  // jsdom globals and fails the run with "removeEventListener is not a
  // function" (seen in CI at the peer floors). restore() has to stop it.
  it("stops the signer's heartbeat timers when restored", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())

    provider.restore()
    const removeListener = vi.spyOn(window, "removeEventListener")
    try {
      await new Promise((resolve) => setTimeout(resolve, 2_500))
      expect(removeListener).not.toHaveBeenCalledWith(
        "message",
        expect.any(Function)
      )
    } finally {
      removeListener.mockRestore()
    }
  })
})
