import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client"

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
      originalWindow = global.window
      vi.clearAllMocks()
    })

    afterEach(() => {
      // Restore window
      ;(global as any).window = originalWindow
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
      const originalProcess = globalThis.process
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
      delete (global as any).window

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
        network: undefined,
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
