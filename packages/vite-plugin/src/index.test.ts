import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { icReactorPlugin, type IcReactorPluginOptions } from "./index"
import fs from "fs"
import path from "path"
import { generateDeclarations, generateReactorFile } from "@ic-reactor/codegen"

// Mock internal dependencies
vi.mock("@ic-reactor/codegen", () => ({
  generateDeclarations: vi.fn(),
  generateReactorFile: vi.fn(),
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
    expect(plugin.configureServer).toBeDefined()
    expect(plugin.buildStart).toBeDefined()
    expect(plugin.handleHotUpdate).toBeDefined()
    expect((plugin as any).config).toBeDefined()
  })

  describe("config", () => {
    it("should set up API proxy", () => {
      const plugin = icReactorPlugin(mockOptions)
      const config = (plugin as any).config()

      expect(config).toEqual({
        server: {
          proxy: {
            "/api": {
              target: "http://127.0.0.1:4943",
              changeOrigin: true,
            },
          },
        },
      })
    })
  })

  describe("configureServer", () => {
    it("should set up ic_env middleware if autoInjectIcEnv is true (default)", () => {
      const plugin = icReactorPlugin(mockOptions)
      ;(plugin.configureServer as any)(mockServer)

      expect(mockServer.middlewares.use).toHaveBeenCalled()
    })

    it("should NOT set up ic_env middleware if autoInjectIcEnv is false", () => {
      const plugin = icReactorPlugin({ ...mockOptions, autoInjectIcEnv: false })
      ;(plugin.configureServer as any)(mockServer)

      expect(mockServer.middlewares.use).not.toHaveBeenCalled()
    })

    it("middleware should handle missing local.ids.json gracefully", () => {
      const plugin = icReactorPlugin(mockOptions)
      ;(plugin.configureServer as any)(mockServer)

      const middleware = mockServer.middlewares.use.mock.calls[0][0]
      const req = {}
      const res = {}
      const next = vi.fn()

      // Mock missing file
      ;(fs.readFileSync as any).mockImplementation(() => {
        throw new Error("File not found")
      })

      middleware(req, res, next)

      expect(mockServer.config.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("icp-cli local IDs not found")
      )
      expect(next).toHaveBeenCalled()
    })

    it("middleware should set cookie when local.ids.json exists", () => {
      const plugin = icReactorPlugin(mockOptions)
      ;(plugin.configureServer as any)(mockServer)

      const middleware = mockServer.middlewares.use.mock.calls[0][0]
      const req = {}
      const res = {
        getHeader: vi.fn(),
        setHeader: vi.fn(),
      }
      const next = vi.fn()

      // Mock existing file
      ;(fs.readFileSync as any).mockReturnValue(
        JSON.stringify({
          test_canister: "ryjl3-tyaaa-aaaaa-aaaba-cai",
        })
      )

      middleware(req, res, next)

      expect(res.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        expect.arrayContaining([
          expect.stringContaining("ic_env="),
          expect.stringContaining(
            "PUBLIC_CANISTER_ID%3Atest_canister%3Dryjl3-tyaaa-aaaaa-aaaba-cai"
          ),
        ])
      )
      expect(next).toHaveBeenCalled()
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
