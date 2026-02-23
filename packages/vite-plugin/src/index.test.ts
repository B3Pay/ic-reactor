import { describe, it, expect, vi, beforeEach } from "vitest"
import { icReactor, type IcReactorPluginOptions } from "./index"
import path from "path"
import { execFileSync } from "child_process"
import { runCanisterPipeline } from "@ic-reactor/codegen"

// Mock internal dependencies
vi.mock("@ic-reactor/codegen", () => ({
  runCanisterPipeline: vi.fn(),
}))

// Mock child_process
vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}))

// Mock fs
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}))

describe("icReactor", () => {
  const mockOptions: IcReactorPluginOptions = {
    canisters: [
      {
        name: "test_canister",
        didFile: "src/declarations/test.did",
        outDir: "src/declarations/test_canister",
      },
    ],
    outDir: "src/declarations",
  }

  const mockServer: any = {
    config: {
      root: "/mock/root",
      logger: {
        info: vi.fn(),
      },
    },
    middlewares: {
      use: vi.fn(),
    },
    restart: vi.fn(),
    ws: {
      send: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.resetAllMocks()
    ;(runCanisterPipeline as any).mockResolvedValue({
      success: true,
    })
  })

  it("should return correct plugin structure", () => {
    const plugin = icReactor(mockOptions)
    expect(plugin.name).toBe("ic-reactor-plugin")
    expect(plugin.buildStart).toBeDefined()
    expect(plugin.handleHotUpdate).toBeDefined()
    expect((plugin as any).config).toBeDefined()
  })

  describe("config", () => {
    it("should set up API proxy and headers when icp-cli is available", () => {
      ;(execFileSync as any).mockImplementation(
        (command: string, args: string[], options: any) => {
          if (
            command === "icp" &&
            args.includes("network") &&
            args.includes("status")
          ) {
            return JSON.stringify({ root_key: "mock-root-key", port: 4943 })
          }
          if (
            command === "icp" &&
            args.includes("canister") &&
            args.includes("status")
          ) {
            return "mock-canister-id"
          }
          return ""
        }
      )

      const plugin = icReactor(mockOptions)
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers["Set-Cookie"]).toContain("ic_env=")
      expect(config.server.headers["Set-Cookie"]).toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id"
      )
      expect(config.server.headers["Set-Cookie"]).toContain(
        "ic_root_key%3Dmock-root-key"
      )
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
    })

    it("should fallback to default proxy when icp-cli fails", () => {
      ;(execFileSync as any).mockImplementation(() => {
        throw new Error("Command not found")
      })

      const plugin = icReactor(mockOptions)
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers).toBeUndefined()
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
    })

    it("should return empty config for build command", () => {
      const plugin = icReactor(mockOptions)
      const config = (plugin as any).config({}, { command: "build" })

      expect(config).toEqual({})
    })
  })

  describe("buildStart", () => {
    it("should generate declarations and reactor file", async () => {
      const plugin = icReactor(mockOptions)
      await (plugin.buildStart as any)()

      expect(runCanisterPipeline).toHaveBeenCalledWith({
        canisterConfig: mockOptions.canisters[0],
        projectRoot: expect.any(String),
        globalConfig: {
          outDir: "src/declarations",
          clientManagerPath: "../../clients",
        },
      })
    })

    it("should handle generation errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "Failed to generate",
      })

      const plugin = icReactor(mockOptions)
      await (plugin.buildStart as any)()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to generate test_canister")
      )

      consoleErrorSpy.mockRestore()
    })

    it("should pass canister mode through to codegen via canister config", async () => {
      const plugin = icReactor({
        canisters: [
          {
            ...mockOptions.canisters[0],
            mode: "Reactor",
          },
        ],
        outDir: mockOptions.outDir,
      })

      await (plugin.buildStart as any)()

      expect(runCanisterPipeline).toHaveBeenCalledWith({
        canisterConfig: {
          ...mockOptions.canisters[0],
          mode: "Reactor",
        },
        projectRoot: expect.any(String),
        globalConfig: {
          outDir: "src/declarations",
          clientManagerPath: "../../clients",
        },
      })
    })
  })

  describe("handleHotUpdate", () => {
    it("should restart server when .did file changes", async () => {
      const plugin = icReactor(mockOptions)
      const ctx = {
        file: "/absolute/path/to/src/declarations/test.did",
        server: mockServer,
      }

      // Mock path.resolve to match the test case
      const originalResolve = path.resolve
      vi.spyOn(path, "resolve").mockImplementation((...args) => {
        if (args.some((a) => a && a.includes("test.did"))) {
          return "/absolute/path/to/src/declarations/test.did"
        }
        return originalResolve(...args)
      })

      await (plugin.handleHotUpdate as any)(ctx)

      expect(mockServer.ws.send).toHaveBeenCalledWith({ type: "full-reload" })
    })

    it("should ignore other files", () => {
      const plugin = icReactor(mockOptions)
      const ctx = {
        file: "/some/other/file.ts",
        server: mockServer,
      }

      ;(plugin.handleHotUpdate as any)(ctx)

      expect(mockServer.ws.send).not.toHaveBeenCalled()
    })
  })
})
