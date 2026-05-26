import { describe, it, expect, vi, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import { AuthenticationManager } from "../src"

function identity(text: string) {
  const principal = Principal.fromText(text)
  return { getPrincipal: () => principal }
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
  }
}

describe("AuthenticationManager", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    vi.clearAllMocks()
    clientManager = new ClientManager({ queryClient: new QueryClient() })
    vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
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
    const AuthClient = vi.fn(function () {
      return authClient
    })
    vi.doMock("@icp-sdk/auth/client", () => ({ AuthClient }))
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      withLocalEnv: true,
      port: 8000,
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
    })

    await authentication.login()

    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider:
        "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })

  it("uses an explicitly configured local II canister id", async () => {
    const authClient = createAuthClient()
    const AuthClient = vi.fn(function () {
      return authClient
    })
    vi.doMock("@icp-sdk/auth/client", () => ({ AuthClient }))
    const localClientManager = new ClientManager({
      queryClient: new QueryClient(),
      withLocalEnv: true,
      port: 8000,
    })
    vi.spyOn(localClientManager, "initializeAgent").mockResolvedValue()
    const authentication = new AuthenticationManager({
      clientManager: localClientManager,
      internetIdentityId: "abcde-fghij-klmno-pqrst-cai",
    })

    await authentication.login()

    expect(AuthClient).toHaveBeenCalledWith({
      identityProvider:
        "http://abcde-fghij-klmno-pqrst-cai.localhost:8000/authorize",
      windowOpenerFeatures: undefined,
      openIdProvider: undefined,
    })
  })
})
