import { describe, it, expect, vi, beforeEach } from "vitest"
import { icReactorPlugin, type IcReactorPluginOptions } from "./index"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import { generateDeclarations, generateReactorFile } from "@ic-reactor/codegen"

// Mock internal dependencies
vi.mock("@ic-reactor/codegen", () => ({
  generateDeclarations: vi.fn(),
  generateReactorFile: vi.fn(),
}))

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}))

// Mock fs
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}))

describe("icReactorPlugin", () => {
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
  }

  beforeEach(() => {
    vi.resetAllMocks()
    ;(generateDeclarations as any).mockResolvedValue({
      success: true,
      declarationsDir: "/mock/declarations",
    })
    ;(generateReactorFile as any).mockReturnValue("export const reactor = {}")
  })

  it("should return correct plugin structure", () => {
    const plugin = icReactorPlugin(mockOptions)
    expect(plugin.name).toBe("ic-reactor-plugin")
    expect(plugin.buildStart).toBeDefined()
    expect(plugin.handleHotUpdate).toBeDefined()
    expect((plugin as any).config).toBeDefined()
    // configureServer is no longer used for middleware
    expect(plugin.configureServer).toBeUndefined()
  })

  describe("config", () => {
    it("should set up API proxy and headers when icp-cli is available", () => {
      ;(execSync as any).mockImplementation((cmd: string) => {
        if (cmd.includes("network status")) {
          return JSON.stringify({ root_key: "mock-root-key" })
        }
        if (cmd.includes("canister status")) {
          return "mock-canister-id"
        }
        return ""
      })

      const plugin = icReactorPlugin(mockOptions)
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
      ;(execSync as any).mockImplementation(() => {
        throw new Error("Command not found")
      })

      const plugin = icReactorPlugin(mockOptions)
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers).toBeUndefined()
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
    })

    it("should return empty config for build command", () => {
      const plugin = icReactorPlugin(mockOptions)
      const config = (plugin as any).config({}, { command: "build" })

      expect(config).toEqual({})
    })
  })

  describe("buildStart", () => {
    it("should generate declarations and reactor file", async () => {
      const plugin = icReactorPlugin(mockOptions)
      await (plugin.buildStart as any)()

      expect(generateDeclarations).toHaveBeenCalledWith({
        didFile: "src/declarations/test.did",
        outDir: "src/declarations/test_canister",
        canisterName: "test_canister",
      })

      expect(generateReactorFile).toHaveBeenCalledWith({
        canisterName: "test_canister",
        canisterConfig: mockOptions.canisters[0],
        globalClientManagerPath: undefined,
      })

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join("src/declarations/test_canister", "index.ts"),
        "export const reactor = {}"
      )
    })

    it("should handle generation errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})

      ;(generateDeclarations as any).mockResolvedValue({
        success: false,
        error: "Failed to generate",
      })

      const plugin = icReactorPlugin(mockOptions)
      await (plugin.buildStart as any)()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to generate declarations")
      )
      expect(generateReactorFile).not.toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe("handleHotUpdate", () => {
    it("should restart server when .did file changes", () => {
      const plugin = icReactorPlugin(mockOptions)
      const ctx = {
        file: "/absolute/path/to/src/declarations/test.did",
        server: mockServer,
      }

      // Mock path.resolve to match the test case
      const originalResolve = path.resolve
      vi.spyOn(path, "resolve").mockImplementation((...args) => {
        if (args.some((a) => a.includes("test.did"))) {
          return "/absolute/path/to/src/declarations/test.did"
        }
        return originalResolve(...args)
      })
      ;(plugin.handleHotUpdate as any)(ctx)

      expect(mockServer.restart).toHaveBeenCalled()
    })

    it("should ignore other files", () => {
      const plugin = icReactorPlugin(mockOptions)
      const ctx = {
        file: "/some/other/file.ts",
        server: mockServer,
      }

      ;(plugin.handleHotUpdate as any)(ctx)

      expect(mockServer.restart).not.toHaveBeenCalled()
    })
  })
})
