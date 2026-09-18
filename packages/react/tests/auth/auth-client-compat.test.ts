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
import {
  detectAuthClientFlavor,
  resetAuthCompatWarnings,
} from "../../src/auth/auth-client-compat.js"

const authClientMocks = vi.hoisted(() => ({ factory: vi.fn() }))

vi.mock("@icp-sdk/auth/client", () => ({ AuthClient: authClientMocks.factory }))

// `probeLocalInternetIdentity` asks the replica, over the real agent, whether
// the local Internet Identity canister serves `/authorize`. There is no replica
// here, so every construction in this file waited out an HTTP failure — several
// cases landed between 2.7s and 5.0s against vitest's 5000ms default, and "rebuilds
// only when the effective options change" tipped over it on a loaded CI runner.
// Nothing in this file is about the probe: it is testing when the AuthClient is
// rebuilt. Stubbing it removes the network from a unit test rather than papering
// over a slow one, and the probe keeps its own coverage in local-ii-probe tests.
vi.mock("../../src/auth/local-ii-probe.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  probeLocalInternetIdentity: vi.fn(async () => ({
    path: "/authorize" as const,
    inconclusive: false,
  })),
}))

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

/** Every console.warn message so far, joined, for `toContain` checks. */
function warningText() {
  return (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls
    .map(([message]) => message)
    .join("\n")
}

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

/**
 * `@icp-sdk/auth` v9 reshaped the AuthClient constructor and v10 moved its
 * `@icp-sdk/core` peer to `^6`. IC Reactor supports both majors, so the option
 * objects have to be translated per installed client while
 * `AuthenticationClientOptions` -- IC Reactor's own contract -- stays put.
 */
describe("auth peer major detection", () => {
  it("reads a v9+ client off the prototype, not the module namespace", () => {
    class SessionEraClient {
      getIdentity() {}
      isAuthenticated() {}
      signIn() {}
      signOut() {}
      requestAttributes() {}
      // Added in v9; no v8 counterpart.
      getStatus() {}
      getPrincipal() {}
    }

    expect(detectAuthClientFlavor(SessionEraClient)).toBe("session")
  })

  it("treats a v8 client as legacy", () => {
    class LegacyClient {
      getIdentity() {}
      isAuthenticated() {}
      signIn() {}
      signOut() {}
      requestAttributes() {}
    }

    expect(detectAuthClientFlavor(LegacyClient)).toBe("legacy")
  })

  it("requires both markers, so one coincidental name is not enough", () => {
    class HalfMatch {
      getStatus() {}
    }

    expect(detectAuthClientFlavor(HalfMatch)).toBe("legacy")
  })

  it("falls back to legacy for something with no prototype at all", () => {
    // Guessing `session` here would rewrite options into a shape a v8 client
    // cannot read; guessing `legacy` passes them through untouched.
    expect(detectAuthClientFlavor(undefined)).toBe("legacy")
    expect(detectAuthClientFlavor({})).toBe("legacy")
  })
})

describe("constructor options across auth majors", () => {
  beforeEach(() => {
    resetAuthCompatWarnings()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  /** Marks the mocked constructor as the v9+ shape. */
  function useSessionEraClient() {
    const factory = authClientMocks.factory
    factory.mockImplementation(function () {
      return createAuthClientStub()
    })
    Object.assign(factory.prototype as object, {
      getStatus: () => {},
      getPrincipal: () => {},
    })
    return factory
  }

  function useLegacyClient() {
    const factory = authClientMocks.factory
    factory.mockImplementation(function () {
      return createAuthClientStub()
    })
    delete (factory.prototype as Record<string, unknown>).getStatus
    delete (factory.prototype as Record<string, unknown>).getPrincipal
    return factory
  }

  it("names the identity provider as a pair for a v9+ client", async () => {
    const factory = useSessionEraClient()
    const { authentication } = createManager({
      identityProvider: "https://id.example.com/authorize",
      internetIdentityId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
    })

    await authentication.prepareClient()

    // v9+ derives nothing from the URL: the origin serving a ceremony is not a
    // promise about which canister mints there, so both halves are named.
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        identityProvider: {
          authorizeUrl: "https://id.example.com/authorize",
          canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
        },
      })
    )
  })

  it("omits the identity provider entirely on mainnet defaults", async () => {
    const factory = useSessionEraClient()
    const { authentication } = createManager({
      identityProvider: "https://id.ai/authorize",
    })

    await authentication.prepareClient()

    // An absent `identityProvider` is v9+'s way of saying "both values are
    // mainnet's", which is more accurate than restating them.
    const [options] = factory.mock.calls[0] as [Record<string, unknown>]
    expect(options).not.toHaveProperty("identityProvider")
  })

  it("leaves a v8 client's identity provider as a plain URL", async () => {
    const factory = useLegacyClient()
    const { authentication } = createManager({
      identityProvider: "https://id.example.com/authorize",
    })

    await authentication.prepareClient()

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        identityProvider: "https://id.example.com/authorize",
      })
    )
  })

  it("drops v8-only options a v9+ client cannot accept, and says so", async () => {
    const factory = useSessionEraClient()
    const storage = {
      get: async () => null,
      set: async () => {},
      remove: async () => {},
    }
    const { authentication } = createManager({
      identityProvider: "https://id.example.com/authorize",
      internetIdentityId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      derivationOrigin: "https://app.example.com",
      keyType: "Ed25519",
      storage,
      idleOptions: { disableIdle: true },
    })

    await authentication.prepareClient()

    const [options] = factory.mock.calls[0] as [Record<string, unknown>]
    // Each of these is a real v8 capability with no v9+ constructor
    // equivalent. Forwarding a key that is silently ignored would be worse
    // than dropping it loudly.
    expect(options).not.toHaveProperty("storage")
    expect(options).not.toHaveProperty("keyType")
    expect(options).not.toHaveProperty("idleOptions")
    // Options that still exist must survive the translation.
    expect(options.derivationOrigin).toBe("https://app.example.com")

    const warnings = (
      console.warn as unknown as { mock: { calls: string[][] } }
    ).mock.calls
      .map(([message]) => message)
      .join("\n")
    expect(warnings).toContain("storage")
    expect(warnings).toContain("keyType")
    expect(warnings).toContain("idleOptions")
  })

  it("still forwards every v8-only option to a v8 client", async () => {
    const factory = useLegacyClient()
    const storage = {
      get: async () => null,
      set: async () => {},
      remove: async () => {},
    }
    const idleOptions = { disableIdle: true }
    const { authentication } = createManager({
      keyType: "Ed25519",
      storage,
      idleOptions,
    })

    await authentication.prepareClient()

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ keyType: "Ed25519", storage, idleOptions })
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  // The `idleOptions` warning tells a v10 user to set `disableBrowserActivity`,
  // so the option has to reach a v10 client rather than stop at IC Reactor's
  // own option handling.
  it("forwards disableBrowserActivity to a v9+ client", async () => {
    const factory = useSessionEraClient()
    const { authentication } = createManager({
      identityProvider: "https://id.example.com/authorize",
      internetIdentityId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      disableBrowserActivity: true,
    })

    await authentication.prepareClient()

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ disableBrowserActivity: true })
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("drops disableBrowserActivity for a v8 client, and says so", async () => {
    const factory = useLegacyClient()
    const { authentication } = createManager({ disableBrowserActivity: true })

    await authentication.prepareClient()

    const [options] = factory.mock.calls[0] as [Record<string, unknown>]
    expect(options).not.toHaveProperty("disableBrowserActivity")
    expect(warningText()).toContain("disableBrowserActivity")
  })

  // A guessed canister sends the delegation calls to a different deployment
  // than the one the user signs in at, so an unknown pairing has to fail here,
  // where the message can name the missing option.
  it("refuses a caller-set provider with no canister on a v9+ client", async () => {
    const factory = useSessionEraClient()
    const { authentication } = createManager({
      identityProvider: "https://id.example.com/authorize",
    })

    await expect(authentication.prepareClient()).rejects.toThrow(
      /internetIdentityId/
    )
    expect(factory).not.toHaveBeenCalled()
  })

  it("pairs IC Reactor's own local provider with the well-known canister", async () => {
    const factory = useSessionEraClient()
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({ clientManager })

    await authentication.prepareClient()

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        identityProvider: {
          authorizeUrl:
            "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000/authorize",
          canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
        },
      })
    )
  })

  // The cookie describes a local deployment. Pairing its canister with the
  // mainnet URL names a deployment that does not exist.
  it("keeps a canister from ic_env away from an explicit mainnet URL", async () => {
    const factory = useSessionEraClient()
    vi.stubGlobal("document", {
      cookie: "ic_env=internet_identity%3Drrkah-fqaaa-aaaaa-aaaaq-cai",
    })
    try {
      const clientManager = new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host: "http://127.0.0.1:8000" },
      })
      vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
      const authentication = new AuthenticationManager({
        clientManager,
        identityProvider: "https://id.ai/authorize",
      })

      await authentication.prepareClient()

      const [options] = factory.mock.calls[0] as [Record<string, unknown>]
      expect(options).not.toHaveProperty("identityProvider")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("does not rebuild a v9+ client for an option v9+ drops", async () => {
    const factory = useSessionEraClient()
    const { authentication } = createManager()

    await authentication.prepareClient()
    await authentication.prepareClient({ keyType: "Ed25519" })

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it("does not rebuild a v8 client for disableBrowserActivity", async () => {
    const factory = useLegacyClient()
    const { authentication } = createManager()

    await authentication.prepareClient()
    await authentication.prepareClient({ disableBrowserActivity: true })

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it("rebuilds the client when disableBrowserActivity changes", async () => {
    const factory = useSessionEraClient()
    const { authentication } = createManager()

    await authentication.prepareClient()
    await authentication.prepareClient({ disableBrowserActivity: true })
    await authentication.prepareClient({ disableBrowserActivity: true })

    // The option comparison names each field it checks, so a field missing
    // from it could never change after the first build.
    expect(factory).toHaveBeenCalledTimes(2)
  })
})

describe("signIn options across auth majors", () => {
  beforeEach(() => {
    resetAuthCompatWarnings()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("strips targets for a v9+ client and warns that the scope is lost", async () => {
    const stub = createAuthClientStub()
    authClientMocks.factory.mockImplementation(function () {
      return stub
    })
    Object.assign(authClientMocks.factory.prototype as object, {
      getStatus: () => {},
      getPrincipal: () => {},
    })
    const { authentication } = createManager({
      identityProvider: "https://id.ai/authorize",
    })

    await authentication.login({
      maxTimeToLive: 123n,
      targets: [Principal.fromText("aaaaa-aa")],
    })

    // `as unknown as` because the stub's signIn is typed with no parameters,
    // matching how the rest of this file reads mock call arguments.
    const [signInOptions] = stub.signIn.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ]
    // v9+ ignores `targets` rather than rejecting it, so the delegation that
    // comes back is broader than the caller asked for. Silence here would hand
    // an app a wider delegation than it requested.
    expect(signInOptions).not.toHaveProperty("targets")
    expect(signInOptions.maxTimeToLive).toBe(123n)
    expect(
      (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls
        .map(([message]) => message)
        .join("\n")
    ).toContain("targets")
  })

  it("keeps targets for a v8 client, which still honours them", async () => {
    const stub = createAuthClientStub()
    authClientMocks.factory.mockImplementation(function () {
      return stub
    })
    delete (authClientMocks.factory.prototype as Record<string, unknown>)
      .getStatus
    delete (authClientMocks.factory.prototype as Record<string, unknown>)
      .getPrincipal
    const targets = [Principal.fromText("aaaaa-aa")]
    const { authentication } = createManager({
      identityProvider: "https://id.ai/authorize",
    })

    await authentication.login({ targets })

    expect(stub.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ targets })
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  // The idle limit moved from the client to the sign-in in v10, and the
  // `idleOptions` warning points there, so `login()` has to pass it on.
  it("forwards maxTimeToIdle to a v9+ client", async () => {
    const stub = createAuthClientStub()
    authClientMocks.factory.mockImplementation(function () {
      return stub
    })
    Object.assign(authClientMocks.factory.prototype as object, {
      getStatus: () => {},
      getPrincipal: () => {},
    })
    const { authentication } = createManager({
      identityProvider: "https://id.ai/authorize",
    })

    await authentication.login({ maxTimeToIdle: 3_600_000_000_000n })

    expect(stub.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ maxTimeToIdle: 3_600_000_000_000n })
    )
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("drops maxTimeToIdle for a v8 client, and says so", async () => {
    const stub = createAuthClientStub()
    authClientMocks.factory.mockImplementation(function () {
      return stub
    })
    delete (authClientMocks.factory.prototype as Record<string, unknown>)
      .getStatus
    delete (authClientMocks.factory.prototype as Record<string, unknown>)
      .getPrincipal
    const { authentication } = createManager({
      identityProvider: "https://id.ai/authorize",
    })

    await authentication.login({ maxTimeToIdle: 3_600_000_000_000n })

    const [signInOptions] = stub.signIn.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ]
    expect(signInOptions).not.toHaveProperty("maxTimeToIdle")
    expect(warningText()).toContain("maxTimeToIdle")
  })

  // The error messages send a caller whose bundler cannot resolve the auth
  // module to this path, and so does the `storage` warning. A client built
  // there never passes the module loader, where the flavor is otherwise read.
  it("detects a pre-built v9+ client, so targets still warns", async () => {
    const stub = Object.assign(createAuthClientStub(), {
      getStatus: vi.fn(),
      getPrincipal: vi.fn(),
    })
    const { authentication } = createManager(
      { identityProvider: "https://id.ai/authorize" },
      stub
    )

    await authentication.login({ targets: [Principal.fromText("aaaaa-aa")] })

    const [signInOptions] = stub.signIn.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ]
    expect(signInOptions).not.toHaveProperty("targets")
    expect(warningText()).toContain("targets")
    expect(authClientMocks.factory).not.toHaveBeenCalled()
  })

  it("forwards maxTimeToIdle when requestAttributes signs in", async () => {
    const stub = Object.assign(createAuthClientStub(), {
      getStatus: vi.fn(),
      getPrincipal: vi.fn(),
    })
    const { authentication } = createManager({}, stub)
    const attributes = new IdentityAttributesManager(authentication)

    await attributes.request({
      keys: ["email"],
      nonce: new Uint8Array([1]),
      maxTimeToIdle: 60_000_000_000n,
    })

    expect(stub.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ maxTimeToIdle: 60_000_000_000n })
    )
  })

  // Each sign-in that passes `targets` gets a broader delegation than it asked
  // for, so a warning spent on an earlier one says nothing about the next.
  it("warns about targets on every v9+ sign-in", async () => {
    const stub = Object.assign(createAuthClientStub(), {
      getStatus: vi.fn(),
      getPrincipal: vi.fn(),
    })
    const { authentication } = createManager(
      { identityProvider: "https://id.ai/authorize" },
      stub
    )
    const targets = [Principal.fromText("aaaaa-aa")]

    await authentication.login({ targets })
    await authentication.login({ targets })

    const targetWarnings = (
      console.warn as unknown as { mock: { calls: string[][] } }
    ).mock.calls.filter(([message]) => message.includes("targets"))
    expect(targetWarnings).toHaveLength(2)
  })
})
