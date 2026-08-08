import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "../../src/auth/index.js"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"

vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: vi.fn(),
}))

const authClientMocks = vi.hoisted(() => ({
  factory: vi.fn(),
}))

vi.mock("@icp-sdk/auth/client", () => ({
  AuthClient: authClientMocks.factory,
}))

function identity(text: string) {
  const principal = Principal.fromText(text)
  return { getPrincipal: () => principal } as any
}

function createAuthClient() {
  let currentIdentity = identity("2vxsx-fae")
  const signedInIdentity = identity("aaaaa-aa")
  return {
    getIdentity: vi.fn(() => currentIdentity),
    isAuthenticated: vi.fn(() => !currentIdentity.getPrincipal().isAnonymous()),
    signIn: vi.fn(async () => {
      currentIdentity = signedInIdentity
      return signedInIdentity
    }),
    signOut: vi.fn(async () => {
      currentIdentity = identity("2vxsx-fae")
    }),
    requestAttributes: vi.fn(),
  } as any
}

function mockAuthClientModule(authClient: Record<string, unknown>) {
  authClientMocks.factory.mockImplementation(function () {
    return authClient as any
  })
  return authClientMocks.factory
}

describe("AuthenticationManager", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    authClientMocks.factory.mockReset()
    vi.clearAllMocks()
    ;(safeGetCanisterEnv as any).mockReturnValue(undefined)
    clientManager = new ClientManager({ queryClient: new QueryClient() })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("owns authentication state independently of ClientManager", async () => {
    const authClient = createAuthClient()
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })

    await authentication.login()

    expect(authClient.signIn).toHaveBeenCalledTimes(1)
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(
      "aaaaa-aa"
    )
  })

  it("opens sign-in before awaiting agent initialization", async () => {
    const events: string[] = []
    const authClient = createAuthClient()
    authClient.signIn.mockImplementation(async () => {
      events.push("signIn")
      return identity("aaaaa-aa")
    })
    vi.spyOn(clientManager, "initializeAgent").mockImplementation(async () => {
      events.push("initializeAgent")
    })
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })

    await authentication.login()

    expect(events).toEqual(["signIn", "initializeAgent"])
  })

  it("publishes auth state to subscribers", async () => {
    const authentication = new AuthenticationManager({
      clientManager,
      authClient: createAuthClient(),
    })
    const subscriber = vi.fn()
    authentication.subscribeAuthState(subscriber)

    await authentication.login()

    expect(subscriber).toHaveBeenLastCalledWith(
      expect.objectContaining({ isAuthenticated: true })
    )
  })

  it("recovers when sign-in reports an error after authentication succeeded", async () => {
    const signedInIdentity = identity("aaaaa-aa")
    const authClient = {
      getIdentity: vi.fn(() => signedInIdentity),
      isAuthenticated: vi.fn(() => true),
      signIn: vi.fn(async () => {
        throw new Error("sign-in channel timed out")
      }),
      signOut: vi.fn(),
      requestAttributes: vi.fn(),
    }
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })

    await authentication.login()

    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(authentication.authState.identity?.getPrincipal().toText()).toBe(
      "aaaaa-aa"
    )
  })

  it("updates state before invoking login success callbacks", async () => {
    const authentication = new AuthenticationManager({
      clientManager,
      authClient: createAuthClient(),
    })
    const onSuccess = vi.fn(() => {
      expect(authentication.authState.isAuthenticated).toBe(true)
    })

    await authentication.login({ onSuccess })

    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it("keeps authenticated state when a success callback fails", async () => {
    const authentication = new AuthenticationManager({
      clientManager,
      authClient: createAuthClient(),
    })
    const error = new Error("callback failed")
    const onError = vi.fn()

    await expect(
      authentication.login({
        onSuccess: () => {
          throw error
        },
        onError,
      })
    ).rejects.toBe(error)

    expect(onError).toHaveBeenCalledWith("callback failed")
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect(authentication.authState.error).toBe(error)
  })

  it("logs out and restores an anonymous agent identity", async () => {
    const authClient = createAuthClient()
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })
    await authentication.login()

    await authentication.logout()

    expect(authClient.signOut).toHaveBeenCalledTimes(1)
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(
      authentication.authState.identity?.getPrincipal().isAnonymous()
    ).toBe(true)
  })

  it("uses configured local II port for default sign-in", async () => {
    const authClient = createAuthClient()
    const AuthClient = mockAuthClientModule(authClient)
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
    })

    await authentication.login()

    expect(AuthClient).toHaveBeenCalledTimes(1)
    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider:
        "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  it("prepares the auth client with the default local II provider", async () => {
    const authClient = createAuthClient()
    const AuthClient = mockAuthClientModule(authClient)
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
    })

    await authentication.prepareClient()

    expect(AuthClient).toHaveBeenCalledTimes(1)
    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider:
        "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  it("uses an explicitly configured local II canister id", async () => {
    const authClient = createAuthClient()
    const AuthClient = mockAuthClientModule(authClient)
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
      internetIdentityId: "abcde-fghij-klmno-pqrst-cai",
    })

    await authentication.login()

    expect(AuthClient).toHaveBeenCalledTimes(1)
    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider:
        "http://abcde-fghij-klmno-pqrst-cai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  it("automatically uses an Internet Identity provider from canister env", async () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:8000" } })
    ;(safeGetCanisterEnv as any).mockReturnValue({
      INTERNET_IDENTITY_PROVIDER: "http://id.ai.localhost:8000/authorize",
    })
    const authClient = createAuthClient()
    const AuthClient = mockAuthClientModule(authClient)
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
    })

    await authentication.login()

    expect(AuthClient).toHaveBeenCalledTimes(1)
    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider: "http://id.ai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  it("uses an Internet Identity provider from a provider-only ic_env cookie", async () => {
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:8000" } })
    vi.stubGlobal("document", {
      cookie:
        "ic_env=INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize",
    })
    ;(safeGetCanisterEnv as any).mockReturnValue(undefined)
    const authClient = createAuthClient()
    const AuthClient = mockAuthClientModule(authClient)
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
    })

    await authentication.login()

    expect(AuthClient).toHaveBeenCalledTimes(1)
    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider: "http://id.ai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  describe("ic_env identity provider is scoped to non-mainnet networks", () => {
    function mainnetManager() {
      const manager = new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host: "https://icp-api.io" },
      })
      vi.spyOn(manager, "initializeAgent").mockResolvedValue()
      return manager
    }

    it("ignores a cross-origin provider from the ic_env cookie", async () => {
      // On mainnet the provider comes from configuration, not the environment,
      // matching how ClientManager treats the cookie's root key.
      vi.stubGlobal("window", {
        location: { origin: "https://app.example.com" },
      })
      vi.stubGlobal("document", {
        cookie:
          "ic_env=INTERNET_IDENTITY_PROVIDER%3Dhttps%3A%2F%2Fother.example%2Fauthorize",
      })
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const authClient = createAuthClient()
      const AuthClient = mockAuthClientModule(authClient)

      const authentication = new AuthenticationManager({
        clientManager: mainnetManager(),
      })
      await authentication.login()

      expect(AuthClient).toHaveBeenCalledWith({
        identityProvider: "https://id.ai/authorize",
        windowOpenerFeatures: undefined,
        openIdProvider: undefined,
      })
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("https://other.example")
      )
      warn.mockRestore()
    })

    it("still accepts a same-origin provider from the ic_env cookie", async () => {
      vi.stubGlobal("window", {
        location: { origin: "https://app.example.com" },
      })
      vi.stubGlobal("document", {
        cookie:
          "ic_env=INTERNET_IDENTITY_PROVIDER%3Dhttps%3A%2F%2Fapp.example.com%2Fauthorize",
      })
      const authClient = createAuthClient()
      const AuthClient = mockAuthClientModule(authClient)

      const authentication = new AuthenticationManager({
        clientManager: mainnetManager(),
      })
      await authentication.login()

      expect(AuthClient).toHaveBeenCalledWith({
        identityProvider: "https://app.example.com/authorize",
        windowOpenerFeatures: undefined,
        openIdProvider: undefined,
      })
    })

    it("keeps an explicitly configured provider, which is never cookie-sourced", async () => {
      vi.stubGlobal("window", {
        location: { origin: "https://app.example.com" },
      })
      vi.stubGlobal("document", {
        cookie:
          "ic_env=INTERNET_IDENTITY_PROVIDER%3Dhttps%3A%2F%2Fother.example%2Fauthorize",
      })
      const authClient = createAuthClient()
      const AuthClient = mockAuthClientModule(authClient)

      const authentication = new AuthenticationManager({
        clientManager: mainnetManager(),
        identityProvider: "https://self-hosted-ii.example.com/authorize",
      })
      await authentication.login()

      expect(AuthClient).toHaveBeenCalledWith({
        identityProvider: "https://self-hosted-ii.example.com/authorize",
        windowOpenerFeatures: undefined,
        openIdProvider: undefined,
      })
    })
  })

  it("ignores an ic_env internet_identity id that is not a principal", async () => {
    // Interpolated into `http://<id>.localhost:<port>/authorize`, so only a
    // bare principal can be substituted in safely.
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:8000" } })
    vi.stubGlobal("document", {
      cookie: "ic_env=internet_identity%3Dnot-a-principal%2Fx%23",
    })
    const authClient = createAuthClient()
    const AuthClient = mockAuthClientModule(authClient)
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "http://127.0.0.1:8000" },
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()

    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
    })
    await authentication.login()

    // Falls back to the well-known local II canister id.
    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider:
        "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })
})

describe("AuthenticationManager session hygiene", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    authClientMocks.factory.mockReset()
    vi.clearAllMocks()
    ;(safeGetCanisterEnv as any).mockReturnValue(undefined)
    clientManager = new ClientManager({ queryClient: new QueryClient() })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("re-observes an expired delegation instead of trusting the cached flag", async () => {
    // Regression: once authenticated, authenticate() returned on the cached
    // flag and never consulted the client again, so a delegation that lapsed
    // mid-session left the UI rendering a signed-in state indefinitely.
    const authClient = createAuthClient()
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })

    await authentication.login()
    expect(authentication.authState.isAuthenticated).toBe(true)

    // The delegation lapses; the client now reports signed out.
    authClient.isAuthenticated.mockResolvedValue(false)
    authClient.getIdentity.mockReturnValue(identity("2vxsx-fae"))

    await authentication.authenticate()

    expect(authentication.authState.isAuthenticated).toBe(false)
  })

  it("keeps the session when the expiry check itself fails", async () => {
    // A transient failure must not sign anyone out.
    const authClient = createAuthClient()
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })

    await authentication.login()
    authClient.isAuthenticated.mockRejectedValue(new Error("storage blip"))

    await authentication.authenticate()

    expect(authentication.authState.isAuthenticated).toBe(true)
  })

  it("does not strand isAuthenticating when signOut fails", async () => {
    const authClient = createAuthClient()
    authClient.signOut.mockRejectedValue(new Error("storage unavailable"))
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })
    await authentication.login()

    await expect(authentication.logout()).rejects.toThrow("storage unavailable")

    expect(authentication.authState.isAuthenticating).toBe(false)
    expect(authentication.authState.error).toBeInstanceOf(Error)
  })
})

describe("AuthenticationManager logout/authenticate race", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    authClientMocks.factory.mockReset()
    vi.clearAllMocks()
    ;(safeGetCanisterEnv as any).mockReturnValue(undefined)
    clientManager = new ClientManager({ queryClient: new QueryClient() })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does not re-install the signed-out identity when logout wins the race", async () => {
    // Regression: a stalled authenticate() applied its result unconditionally,
    // putting the delegation of a user who had just signed out back on the
    // agent.
    const authClient = createAuthClient()
    const authentication = new AuthenticationManager({
      clientManager,
      authClient,
    })
    await authentication.login()
    const signedInPrincipal = authentication.authState.identity
      ?.getPrincipal()
      .toText()

    // Stall the identity read so logout can complete underneath it.
    let releaseIdentity: () => void = () => {}
    const stalled = new Promise<void>((resolve) => {
      releaseIdentity = resolve
    })
    const signedInIdentity = authClient.getIdentity()
    const anonymous = identity("2vxsx-fae")
    let stalledOnce = false
    authClient.getIdentity.mockImplementation(async () => {
      if (!stalledOnce) {
        // Only authenticate()'s read stalls; logout() must be able to proceed.
        stalledOnce = true
        await stalled
        return signedInIdentity
      }
      return anonymous
    })
    authClient.isAuthenticated.mockResolvedValue(false)
    ;(authentication as any).authStateValue = {
      ...authentication.authState,
      isAuthenticated: false,
    }

    const pending = authentication.authenticate()
    await authentication.logout()
    releaseIdentity()
    await pending

    expect(authentication.authState.isAuthenticated).toBe(false)
    expect(
      authentication.authState.identity?.getPrincipal().isAnonymous()
    ).toBe(true)
    expect(authentication.authState.identity?.getPrincipal().toText()).not.toBe(
      signedInPrincipal
    )
  })
})
