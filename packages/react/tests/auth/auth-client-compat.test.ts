/**
 * The `@icp-sdk/auth` nonce contract and the AuthClient options IC Reactor
 * forwards.
 *
 * The peer range narrowed to `^8.0.0` in 3.12.0, so the v7 cases that used to
 * live here are gone along with the runtime probe they covered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"

const authClientMocks = vi.hoisted(() => ({ factory: vi.fn() }))

vi.mock("@icp-sdk/auth/client", () => ({ AuthClient: authClientMocks.factory }))

const identity = { getPrincipal: () => Principal.fromText("aaaaa-aa") } as never

function createAuthClientStub() {
  const client = {
    getIdentity: vi.fn(() => identity),
    isAuthenticated: vi.fn(() => true),
    signIn: vi.fn(async () => identity),
    signOut: vi.fn(async () => {}),
    requestAttributes: vi.fn(async () => ({
      data: new Uint8Array(),
      signature: new Uint8Array(),
    })),
    memoize: vi.fn(async (produce: () => unknown) => produce()),
  }
  return client as typeof client & Record<string, unknown>
}

function createManager(
  params: Record<string, unknown> = {},
  authClient?: ReturnType<typeof createAuthClientStub>
) {
  const clientManager = new ClientManager({ queryClient: new QueryClient() })
  vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  const authentication = new AuthenticationManager({
    clientManager,
    ...(authClient ? { authClient } : {}),
    ...params,
  } as never)
  return { clientManager, authentication }
}

beforeEach(() => {
  authClientMocks.factory.mockReset()
})

describe("@icp-sdk/auth nonce contract", () => {
  it("always hands the client a nonce thunk", async () => {
    const authClient = createAuthClientStub()
    const { authentication } = createManager({}, authClient)
    const attributes = new IdentityAttributesManager(authentication)

    await attributes.request({ keys: ["email"], nonce: new Uint8Array([4, 2]) })

    const [request] = authClient.requestAttributes.mock.calls[0] as unknown as [
      { nonce: unknown },
    ]
    // v8 calls `nonce()`; handing it a Uint8Array would throw at runtime.
    expect(typeof request.nonce).toBe("function")
    await expect(
      (request.nonce as () => Promise<Uint8Array>)()
    ).resolves.toEqual(new Uint8Array([4, 2]))
  })

  it("defers a lazily produced nonce until the client asks for it", async () => {
    const authClient = createAuthClientStub()
    const { authentication } = createManager({}, authClient)
    const attributes = new IdentityAttributesManager(authentication)

    const produce = vi.fn(async () => new Uint8Array([7]))
    await attributes.request({ keys: ["email"], nonce: produce })

    // v8 journals the nonce itself, so it must stay unevaluated until called.
    expect(produce).not.toHaveBeenCalled()
    const [request] = authClient.requestAttributes.mock.calls[0] as unknown as [
      { nonce: () => Promise<Uint8Array> },
    ]
    await expect(request.nonce()).resolves.toEqual(new Uint8Array([7]))
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it("accepts a promise nonce and still passes a thunk", async () => {
    const authClient = createAuthClientStub()
    const { authentication } = createManager({}, authClient)
    const attributes = new IdentityAttributesManager(authentication)

    await attributes.request({
      keys: ["email"],
      nonce: Promise.resolve(new Uint8Array([1])),
    })

    const [request] = authClient.requestAttributes.mock.calls[0] as unknown as [
      { nonce: () => Promise<Uint8Array> },
    ]
    expect(typeof request.nonce).toBe("function")
    await expect(request.nonce()).resolves.toEqual(new Uint8Array([1]))
  })
})

describe("AuthClient option pass-through", () => {
  it("forwards derivationOrigin, keyType, storage and idleOptions", async () => {
    const storage = {
      get: async () => null,
      set: async () => {},
      remove: async () => {},
    }
    const idleOptions = { disableIdle: true }
    const { authentication } = createManager({
      derivationOrigin: "https://app.example.com",
      keyType: "Ed25519",
      storage,
      idleOptions,
    })

    await authentication.prepareClient()

    expect(authClientMocks.factory).toHaveBeenCalledTimes(1)
    expect(authClientMocks.factory).toHaveBeenCalledWith(
      expect.objectContaining({
        derivationOrigin: "https://app.example.com",
        keyType: "Ed25519",
        storage,
        idleOptions,
      })
    )
  })

  it("lets a login call override constructor defaults", async () => {
    authClientMocks.factory.mockImplementation(function () {
      return createAuthClientStub()
    })
    const { authentication } = createManager({
      derivationOrigin: "https://app.example.com",
    })
    await authentication.prepareClient()

    await authentication.login({
      derivationOrigin: "https://other.example.com",
    })

    expect(authClientMocks.factory).toHaveBeenCalledTimes(2)
    expect(authClientMocks.factory).toHaveBeenLastCalledWith(
      expect.objectContaining({ derivationOrigin: "https://other.example.com" })
    )
  })
})

describe("AuthClient reuse", () => {
  it("reuses the prepared client instead of rebuilding it on every call", async () => {
    authClientMocks.factory.mockImplementation(function () {
      return createAuthClientStub()
    })
    const { authentication } = createManager()

    await authentication.prepareClient()
    await authentication.prepareClient()
    await authentication.login()
    await authentication.authenticate()

    // Rebuilding would drop the warmed-up client and register another
    // sign-out callback on the shared IdleManager singleton.
    expect(authClientMocks.factory).toHaveBeenCalledTimes(1)
  })

  it("rebuilds only when the effective options change", async () => {
    authClientMocks.factory.mockImplementation(function () {
      return createAuthClientStub()
    })
    const { authentication } = createManager()

    await authentication.prepareClient()
    await authentication.prepareClient({ openIdProvider: "google" })
    await authentication.prepareClient({ openIdProvider: "google" })

    expect(authClientMocks.factory).toHaveBeenCalledTimes(2)
  })

  it("never rebuilds a caller-supplied client", async () => {
    const authClient = createAuthClientStub()
    const { authentication } = createManager(
      { identityProvider: "https://id.ai/authorize" },
      authClient
    )

    await authentication.prepareClient({ openIdProvider: "google" })
    await authentication.login({ openIdProvider: "apple" })

    expect(authClientMocks.factory).not.toHaveBeenCalled()
    expect(authClient.signIn).toHaveBeenCalledTimes(1)
  })
})

describe("session restore", () => {
  it("does not invalidate the query cache when restoring an anonymous session", async () => {
    const anonymous = {
      getPrincipal: () => Principal.fromText("2vxsx-fae"),
    } as never
    authClientMocks.factory.mockImplementation(function () {
      return {
        getIdentity: vi.fn(() => anonymous),
        isAuthenticated: vi.fn(() => false),
        signIn: vi.fn(),
        signOut: vi.fn(),
        requestAttributes: vi.fn(),
      }
    })
    const { clientManager, authentication } = createManager()
    const invalidate = vi.spyOn(clientManager.queryClient, "invalidateQueries")

    await authentication.authenticate()

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
