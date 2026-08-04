/**
 * End-to-end Internet Identity tests against the **real** `@icp-sdk/auth`
 * AuthClient. Nothing in the auth package is mocked — only the browser
 * boundary (`window.open`) is replaced by a fake II that speaks the real
 * ICRC-29 / ICRC-34 / `ii-icrc3-attributes` wire protocol.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"
import {
  installFakeIdentityProvider,
  withUserGesture,
  encodeAttributes,
  fromBase64,
  type FakeIdentityProvider,
} from "./fake-identity-provider.js"

let provider: FakeIdentityProvider

function createManager(
  params: Partial<ConstructorParameters<typeof AuthenticationManager>[0]> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const clientManager = new ClientManager({
    queryClient,
    agentOptions: { host: "https://icp-api.io", shouldFetchRootKey: false },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    ...params,
  })
  return { queryClient, clientManager, authentication }
}

beforeEach(() => {
  localStorage.clear()
  provider = installFakeIdentityProvider()
})

afterEach(() => {
  provider.restore()
})

describe("Internet Identity sign-in (real AuthClient)", () => {
  it("signs in through the II popup and puts the delegated identity on the agent", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()

    await withUserGesture(() => authentication.login())

    expect(provider.openCount).toBe(1)
    expect(provider.delegationRequests).toHaveLength(1)

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

  it("forwards maxTimeToLive and targets to the identity provider", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    const maxTimeToLive = 3_600_000_000_000n
    await withUserGesture(() =>
      authentication.login({
        maxTimeToLive,
        targets: [Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai")],
      })
    )

    const request = provider.delegationRequests[0]
    expect(request.maxTimeToLive).toBe(maxTimeToLive.toString())
    expect(request.targets).toEqual(["rrkah-fqaaa-aaaaa-aaaaq-cai"])
  })

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
  it("uses the production II provider on mainnet", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())

    expect(provider.openedUrls[0]).toBe("https://id.ai/authorize")
  })

  it("honours an explicit identityProvider", async () => {
    const { authentication } = createManager({
      identityProvider: "https://identity.internetcomputer.org/authorize",
    })
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())

    expect(provider.openedUrls[0]).toBe(
      "https://identity.internetcomputer.org/authorize"
    )
  })

  it("adds the openid search param for one-click providers", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient({ openIdProvider: "google" })
    await withUserGesture(() =>
      authentication.login({ openIdProvider: "google" })
    )

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
