import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"

vi.mock("@icp-sdk/core/agent/canister-env", () => ({
  safeGetCanisterEnv: vi.fn(),
}))

describe("ClientManager", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient()
    vi.clearAllMocks()
    ;(safeGetCanisterEnv as any).mockReturnValue(undefined)
  })

  describe("network configuration", () => {
    it("initializes with mainnet host by default", () => {
      const manager = new ClientManager({ queryClient })

      expect(manager.agentHost?.toString()).toBe("https://ic0.app/")
      expect(manager.network).toBe("ic")
      expect(manager.isLocal).toBe(false)
    })

    it("initializes with a configured local host", () => {
      const manager = new ClientManager({
        queryClient,
        withLocalEnv: true,
        port: 8000,
      })

      expect(manager.agentHost?.toString()).toBe("http://127.0.0.1:8000/")
      expect(manager.agentState.isLocalhost).toBe(true)
    })

    it("uses a custom host from agent options", () => {
      const manager = new ClientManager({
        queryClient,
        agentOptions: { host: "https://custom-host.example.com" },
      })

      expect(manager.agentHost?.toString()).toBe(
        "https://custom-host.example.com/"
      )
    })
  })

  describe("process environment", () => {
    let originalProcess: typeof globalThis.process

    beforeEach(() => {
      originalProcess = globalThis.process
    })

    afterEach(() => {
      ;(globalThis as any).process = originalProcess
    })

    it("honors ICP_NETWORK=local from icp-cli", () => {
      ;(globalThis as any).process = { env: { ICP_NETWORK: "local" } }

      const manager = new ClientManager({
        queryClient,
        withProcessEnv: true,
        port: 8000,
      })

      expect(manager.agentHost?.toString()).toBe("http://127.0.0.1:8000/")
      expect(manager.isLocal).toBe(true)
    })

    it("honors ICP_HOST for a local icp-cli network", () => {
      ;(globalThis as any).process = {
        env: { ICP_NETWORK: "local", ICP_HOST: "http://127.0.0.1:8123" },
      }

      const manager = new ClientManager({ queryClient, withProcessEnv: true })

      expect(manager.agentHost?.toString()).toBe("http://127.0.0.1:8123/")
    })

    it("honors ICP_NETWORK=ic", () => {
      ;(globalThis as any).process = { env: { ICP_NETWORK: "ic" } }

      const manager = new ClientManager({ queryClient, withProcessEnv: true })

      expect(manager.agentHost?.toString()).toBe("https://ic0.app/")
    })
  })

  describe("withCanisterEnv", () => {
    let originalWindow: typeof globalThis.window

    beforeEach(() => {
      originalWindow = globalThis.window
    })

    afterEach(() => {
      ;(globalThis as any).window = originalWindow
      vi.restoreAllMocks()
    })

    it("can be enabled outside the browser", () => {
      delete (globalThis as any).window

      expect(
        () => new ClientManager({ queryClient, withCanisterEnv: true })
      ).not.toThrow()
    })

    it("automatically uses ic_env in the browser when present", () => {
      vi.stubGlobal("window", {
        location: { origin: "http://127.0.0.1:3000" },
      })
      ;(safeGetCanisterEnv as any).mockReturnValue({
        "PUBLIC_CANISTER_ID:backend": "aaaaa-aa",
      })
      vi.spyOn(console, "warn").mockImplementation(() => undefined)

      const manager = new ClientManager({ queryClient })

      expect(manager.agentHost?.toString()).toBe("http://127.0.0.1:3000/")
      expect(manager.isLocal).toBe(true)
    })

    it("opts out of automatic ic_env detection when disabled", () => {
      vi.stubGlobal("window", {
        location: { origin: "http://127.0.0.1:3000" },
      })
      ;(safeGetCanisterEnv as any).mockReturnValue({
        "PUBLIC_CANISTER_ID:backend": "aaaaa-aa",
      })

      const manager = new ClientManager({
        queryClient,
        withCanisterEnv: false,
      })

      expect(manager.agentHost?.toString()).toBe("https://ic0.app/")
      expect(manager.isLocal).toBe(false)
    })
  })

  describe("registrations and subscriptions", () => {
    it("tracks canister ids without duplicates", () => {
      const manager = new ClientManager({ queryClient })
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

      manager.registerCanisterId(canisterId, "ledger")
      manager.registerCanisterId(canisterId, "ledger")

      expect(manager.connectedCanisterIds()).toEqual([canisterId])
    })

    it("subscribes to agent and identity changes", () => {
      const manager = new ClientManager({ queryClient })

      expect(typeof manager.subscribe(vi.fn())).toBe("function")
      expect(typeof manager.subscribeAgentState(vi.fn())).toBe("function")
    })
  })

  it("returns an anonymous principal by default", async () => {
    const manager = new ClientManager({ queryClient })

    expect((await manager.getUserPrincipal()).isAnonymous()).toBe(true)
  })
})
