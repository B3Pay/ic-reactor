import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client"

function mockIdentity(principalText: string) {
  const principal = Principal.fromText(principalText)
  return {
    getPrincipal: () => principal,
  }
}

const anonymousIdentity = {
  getPrincipal: () => Principal.anonymous(),
}

describe("ClientManager", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient()
    vi.clearAllMocks()
  })

  describe("Constructor defaults", () => {
    it("should initialize with mainnet host by default", () => {
      const clientManager = new ClientManager({ queryClient })

      expect(clientManager.agentHost?.toString()).toBe("https://ic0.app/")
      expect(clientManager.network).toBe("ic")
      expect(clientManager.isLocal).toBe(false)
    })

    it("should initialize with local host when withLocalEnv is true", () => {
      const clientManager = new ClientManager({
        queryClient,
        withLocalEnv: true,
      })

      expect(clientManager.agentHost?.toString()).toBe("http://127.0.0.1:4943/")
      expect(clientManager.network).toBe("local")
      expect(clientManager.isLocal).toBe(true)
    })

    it("should use custom port for local environment", () => {
      const clientManager = new ClientManager({
        queryClient,
        withLocalEnv: true,
        port: 8000,
      })

      expect(clientManager.agentHost?.toString()).toBe("http://127.0.0.1:8000/")
    })

    it("should use custom host from agentOptions", () => {
      const clientManager = new ClientManager({
        queryClient,
        agentOptions: {
          host: "https://custom-host.example.com",
        },
      })

      expect(clientManager.agentHost?.toString()).toBe(
        "https://custom-host.example.com/"
      )
    })
  })

  describe("withCanisterEnv (EXPERIMENTAL)", () => {
    let originalWindow: typeof globalThis.window

    beforeEach(() => {
      originalWindow = globalThis.window
      vi.clearAllMocks()
    })

    afterEach(() => {
      // Restore window
      ;(globalThis as any).window = originalWindow
      vi.restoreAllMocks()
    })

    it("should set default host when withCanisterEnv is false/undefined", () => {
      const clientManager = new ClientManager({ queryClient })

      expect(clientManager.agentHost?.toString()).toBe("https://ic0.app/")
    })

    it("should set default host when withCanisterEnv is explicitly false", () => {
      const clientManager = new ClientManager({
        queryClient,
        withCanisterEnv: false,
      })

      expect(clientManager.agentHost?.toString()).toBe("https://ic0.app/")
    })

    it("should not override withLocalEnv when withCanisterEnv is false", () => {
      const clientManager = new ClientManager({
        queryClient,
        withLocalEnv: true,
        withCanisterEnv: false,
      })

      expect(clientManager.agentHost?.toString()).toBe("http://127.0.0.1:4943/")
      expect(clientManager.isLocal).toBe(true)
    })

    it("should not override withProcessEnv when withCanisterEnv is false", () => {
      // Mock process.env
      const originalProcess = (globalThis as any).process
      ;(globalThis as any).process = {
        env: {
          DFX_NETWORK: "ic",
        },
      }

      const clientManager = new ClientManager({
        queryClient,
        withProcessEnv: true,
        withCanisterEnv: false,
      })

      expect(clientManager.agentHost?.toString()).toBe("https://ic0.app/")

      // Restore
      ;(globalThis as any).process = originalProcess
    })

    // Note: Testing withCanisterEnv: true requires mocking the dynamic import
    // of @icp-sdk/core/agent/canister-env which is complex in Node.js test environment.
    // The actual browser behavior is tested via integration/e2e tests.
    it("should accept withCanisterEnv parameter without throwing", () => {
      // When not in browser (typeof window === 'undefined'),
      // safeGetCanisterEnv is not called, so this should work
      delete (globalThis as any).window

      expect(() => {
        new ClientManager({
          queryClient,
          withCanisterEnv: true,
        })
      }).not.toThrow()
    })
  })

  describe("Agent state", () => {
    it("should have correct initial agent state", () => {
      const clientManager = new ClientManager({ queryClient })

      expect(clientManager.agentState).toEqual({
        isInitialized: false,
        isInitializing: false,
        error: undefined,
        network: "ic",
        isLocalhost: false,
      })
    })

    it("should set isLocalhost true when using local environment", () => {
      const clientManager = new ClientManager({
        queryClient,
        withLocalEnv: true,
      })

      expect(clientManager.agentState.isLocalhost).toBe(true)
    })
  })

  describe("Auth state", () => {
    it("should have correct initial auth state", () => {
      const clientManager = new ClientManager({ queryClient })

      expect(clientManager.authState).toEqual({
        identity: null,
        isAuthenticating: false,
        isAuthenticated: false,
        error: undefined,
      })
    })

    it("supports v6 constructor/signIn auth clients", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = anonymousIdentity
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(async () => {
          currentIdentity = anonymousIdentity
        }),
        requestAttributes: vi.fn(),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })

      await clientManager.login()

      expect(authClient.signIn).toHaveBeenCalledTimes(1)
      expect(clientManager.authState.isAuthenticated).toBe(true)
      expect(clientManager.authState.identity?.getPrincipal().toText()).toBe(
        "aaaaa-aa"
      )
    })

    it("opens sign-in before awaiting agent initialization", async () => {
      const identity = mockIdentity("aaaaa-aa")
      const events: string[] = []
      const authClient = {
        getIdentity: vi.fn(() => identity),
        isAuthenticated: vi.fn(() => true),
        signIn: vi.fn(async () => {
          events.push("signIn")
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })
      vi.spyOn(clientManager, "initializeAgent").mockImplementation(
        async () => {
          events.push("initializeAgent")
        }
      )

      await clientManager.login()

      expect(events).toEqual(["signIn", "initializeAgent"])
    })

    it("recovers login when signIn times out after identity is authenticated", async () => {
      const identity = mockIdentity("aaaaa-aa")
      const timeout = new Error(
        "Communication channel could not be established within a reasonable time"
      )
      const authClient = {
        getIdentity: vi.fn(() => identity),
        isAuthenticated: vi.fn(() => true),
        signIn: vi.fn(async () => {
          throw timeout
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })
      vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()

      await clientManager.login()

      expect(clientManager.authState.isAuthenticated).toBe(true)
      expect(clientManager.authState.identity?.getPrincipal().toText()).toBe(
        "aaaaa-aa"
      )
    })

    it("uses the authorize endpoint for default mainnet login", async () => {
      const identity = mockIdentity("aaaaa-aa")
      const authClient = {
        getIdentity: vi.fn(() => identity),
        isAuthenticated: vi.fn(() => true),
        signIn: vi.fn(async () => identity),
        logout: vi.fn(),
        requestAttributes: vi.fn(),
      }
      const AuthClient = vi.fn(function () {
        return authClient
      })
      vi.doMock("@icp-sdk/auth/client", () => ({ AuthClient }))
      const clientManager = new ClientManager({ queryClient })
      vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()

      await clientManager.login()

      expect(AuthClient).toHaveBeenCalledWith({
        identityProvider: "https://id.ai/authorize",
        windowOpenerFeatures: undefined,
        openIdProvider: undefined,
      })
    })

    it("updates auth state before invoking login onSuccess", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = anonymousIdentity
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })
      const onSuccess = vi.fn(() => {
        expect(clientManager.authState.isAuthenticated).toBe(true)
        expect(clientManager.authState.identity?.getPrincipal().toText()).toBe(
          "aaaaa-aa"
        )
      })

      await clientManager.login({ onSuccess })

      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(clientManager.authState.isAuthenticated).toBe(true)
    })

    it("keeps authenticated state when login onSuccess throws", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = anonymousIdentity
      const error = new Error("callback failed")
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })
      const onError = vi.fn()

      await expect(
        clientManager.login({
          onSuccess: () => {
            throw error
          },
          onError,
        })
      ).rejects.toBe(error)

      expect(onError).toHaveBeenCalledWith("callback failed")
      expect(clientManager.authState.isAuthenticated).toBe(true)
      expect(clientManager.authState.identity?.getPrincipal().toText()).toBe(
        "aaaaa-aa"
      )
      expect(clientManager.authState.error).toBe(error)
    })

    it("logs out with v6 auth clients", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = identity
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(async () => {
          currentIdentity = anonymousIdentity
        }),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })

      await clientManager.logout()

      expect(authClient.logout).toHaveBeenCalledTimes(1)
      expect(clientManager.authState.isAuthenticated).toBe(false)
      expect(
        clientManager.authState.identity?.getPrincipal().isAnonymous()
      ).toBe(true)
    })

    it("requests identity attributes and updates auth state after sign-in", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = anonymousIdentity
      const data = new Uint8Array([68, 73, 68, 76])
      const signature = new Uint8Array([1, 2, 3])
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(async () => ({ data, signature })),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })

      const result = await clientManager.requestIdentityAttributes({
        keys: ["openid:https://issuer.example.com:email"],
        nonce: new Uint8Array([9, 9]),
      })

      expect(authClient.signIn).toHaveBeenCalledTimes(1)
      expect(authClient.requestAttributes).toHaveBeenCalledWith({
        keys: ["openid:https://issuer.example.com:email"],
        nonce: new Uint8Array([9, 9]),
      })
      expect(result.principal).toBe("aaaaa-aa")
      expect(result.signedAttributes.data).toEqual(data)
      expect(clientManager.authState.isAuthenticated).toBe(true)
    })

    it("starts attribute sign-in and request before awaiting agent initialization", async () => {
      const identity = mockIdentity("aaaaa-aa")
      const events: string[] = []
      const data = new Uint8Array([68, 73, 68, 76])
      const signature = new Uint8Array([1, 2, 3])
      const authClient = {
        getIdentity: vi.fn(() => identity),
        isAuthenticated: vi.fn(() => true),
        signIn: vi.fn(async () => {
          events.push("signIn")
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(async () => {
          events.push("requestAttributes")
          return { data, signature }
        }),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })
      vi.spyOn(clientManager, "initializeAgent").mockImplementation(
        async () => {
          events.push("initializeAgent")
        }
      )

      await clientManager.requestIdentityAttributes({
        keys: ["openid:https://issuer.example.com:email"],
        nonce: new Uint8Array([9, 9]),
      })

      expect(events).toEqual(["signIn", "requestAttributes", "initializeAgent"])
    })

    it("recovers attribute requests when signIn times out after identity is authenticated", async () => {
      const identity = mockIdentity("aaaaa-aa")
      const timeout = new Error(
        "Communication channel could not be established within a reasonable time"
      )
      const data = new Uint8Array([68, 73, 68, 76])
      const signature = new Uint8Array([1, 2, 3])
      const authClient = {
        getIdentity: vi.fn(() => identity),
        isAuthenticated: vi.fn(() => true),
        signIn: vi.fn(async () => {
          throw timeout
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(async () => ({ data, signature })),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })
      vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()

      const result = await clientManager.requestIdentityAttributes({
        keys: ["openid:https://issuer.example.com:email"],
        nonce: new Uint8Array([9, 9]),
      })

      expect(result.principal).toBe("aaaaa-aa")
      expect(clientManager.authState.isAuthenticated).toBe(true)
    })

    it("requests OpenID identity attributes for arbitrary providers", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = anonymousIdentity
      const data = new Uint8Array([68, 73, 68, 76])
      const signature = new Uint8Array([1, 2, 3])
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(async () => ({ data, signature })),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })

      const result = await clientManager.requestOpenIdIdentityAttributes({
        openIdProvider: "https://issuer.example.com",
        keys: ["email"],
        nonce: new Uint8Array([9, 9]),
      })

      expect(authClient.requestAttributes).toHaveBeenCalledWith({
        keys: ["openid:https://issuer.example.com:email"],
        nonce: new Uint8Array([9, 9]),
      })
      expect(result.requestedKeys).toEqual([
        "openid:https://issuer.example.com:email",
      ])
    })

    it("does not pass custom issuer URLs as AuthClient provider aliases", async () => {
      const identity = mockIdentity("aaaaa-aa")
      const data = new Uint8Array([68, 73, 68, 76])
      const signature = new Uint8Array([1, 2, 3])
      const authClient = {
        getIdentity: vi.fn(() => identity),
        isAuthenticated: vi.fn(() => true),
        signIn: vi.fn(async () => identity),
        logout: vi.fn(),
        requestAttributes: vi.fn(async () => ({ data, signature })),
      }
      const AuthClient = vi.fn(function () {
        return authClient
      })
      vi.doMock("@icp-sdk/auth/client", () => ({ AuthClient }))
      const clientManager = new ClientManager({ queryClient })

      await clientManager.requestOpenIdIdentityAttributes({
        openIdProvider: "https://issuer.example.com",
        keys: ["email"],
        nonce: new Uint8Array([9, 9]),
      })

      expect(AuthClient).toHaveBeenCalledWith({
        identityProvider: "https://beta.id.ai/authorize",
        windowOpenerFeatures: undefined,
        openIdProvider: undefined,
      })
      expect(authClient.requestAttributes).toHaveBeenCalledWith({
        keys: ["openid:https://issuer.example.com:email"],
        nonce: new Uint8Array([9, 9]),
      })
    })

    it("accepts documented OpenID provider aliases", async () => {
      const identity = mockIdentity("aaaaa-aa")
      let currentIdentity: any = anonymousIdentity
      const data = new Uint8Array([68, 73, 68, 76])
      const signature = new Uint8Array([1, 2, 3])
      const authClient = {
        getIdentity: vi.fn(() => currentIdentity),
        isAuthenticated: vi.fn(
          () => !currentIdentity.getPrincipal().isAnonymous()
        ),
        signIn: vi.fn(async () => {
          currentIdentity = identity
          return identity
        }),
        logout: vi.fn(),
        requestAttributes: vi.fn(async () => ({ data, signature })),
      }
      const clientManager = new ClientManager({
        queryClient,
        authClient: authClient as any,
      })

      const result = await clientManager.requestOpenIdIdentityAttributes({
        openIdProvider: "microsoft",
        keys: ["email"],
        nonce: new Uint8Array([9, 9]),
      })

      expect(authClient.requestAttributes).toHaveBeenCalledWith({
        keys: ["openid:https://login.microsoftonline.com/{tid}/v2.0:email"],
        nonce: new Uint8Array([9, 9]),
      })
      expect(result.requestedKeys).toEqual([
        "openid:https://login.microsoftonline.com/{tid}/v2.0:email",
      ])
    })
  })

  describe("Canister registration", () => {
    it("should register and track canister IDs", () => {
      const clientManager = new ClientManager({ queryClient })

      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"
      clientManager.registerCanisterId(canisterId, "ledger")

      expect(clientManager.connectedCanisterIds()).toContain(canisterId)
    })

    it("should return empty array when no canisters registered", () => {
      const clientManager = new ClientManager({ queryClient })

      expect(clientManager.connectedCanisterIds()).toEqual([])
    })

    it("should not duplicate canister IDs when registering same ID twice", () => {
      const clientManager = new ClientManager({ queryClient })

      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"
      clientManager.registerCanisterId(canisterId, "ledger")
      clientManager.registerCanisterId(canisterId, "ledger")

      expect(clientManager.connectedCanisterIds()).toEqual([canisterId])
    })
  })

  describe("Subscriptions", () => {
    it("should allow subscribing to identity changes", () => {
      const clientManager = new ClientManager({ queryClient })
      const callback = vi.fn()

      const unsubscribe = clientManager.subscribe(callback)

      expect(typeof unsubscribe).toBe("function")
      unsubscribe()
    })

    it("should allow subscribing to agent state changes", () => {
      const clientManager = new ClientManager({ queryClient })
      const callback = vi.fn()

      const unsubscribe = clientManager.subscribeAgentState(callback)

      expect(typeof unsubscribe).toBe("function")
      unsubscribe()
    })

    it("should allow subscribing to auth state changes", () => {
      const clientManager = new ClientManager({ queryClient })
      const callback = vi.fn()

      const unsubscribe = clientManager.subscribeAuthState(callback)

      expect(typeof unsubscribe).toBe("function")
      unsubscribe()
    })
  })

  describe("getUserPrincipal", () => {
    it("should return anonymous principal by default", async () => {
      const clientManager = new ClientManager({ queryClient })

      const principal = await clientManager.getUserPrincipal()

      expect(principal.isAnonymous()).toBe(true)
    })
  })
})
