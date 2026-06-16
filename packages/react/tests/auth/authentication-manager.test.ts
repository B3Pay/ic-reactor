import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "../../src/auth"
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
})
