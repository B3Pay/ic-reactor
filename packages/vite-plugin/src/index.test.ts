import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vitePluginModule from "./index.js"
import type { IcReactorPluginOptions } from "./index.js"
import path from "node:path"
import { execFileSync } from "child_process"
import { runCanisterPipeline } from "@ic-reactor/codegen"

const createVitePlugin =
  (vitePluginModule as any).icReactor ??
  (vitePluginModule as any).icReactorPlugin

// Mock internal dependencies
vi.mock("@ic-reactor/codegen", () => ({
  runCanisterPipeline: vi.fn(),
}))

// Mock child_process
vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}))

/**
 * A Vite root that is deliberately not the process cwd, so every path
 * assertion below fails if the plugin falls back to `process.cwd()`.
 */
const VITE_ROOT = path.resolve("/vite/root")
const DID_RELATIVE = "src/declarations/test.did"
const DID_IN_VITE_ROOT = path.resolve(VITE_ROOT, DID_RELATIVE)
const DID_IN_CWD = path.resolve(process.cwd(), DID_RELATIVE)

/**
 * Rollup's `this.error()` throws, which is what turns a generation failure into
 * a non-zero `vite build` exit. Model that faithfully — a context whose `error`
 * only records the call would let a regression through.
 */
function buildContext() {
  const error = vi.fn((reason: string | Error) => {
    throw reason instanceof Error ? reason : new Error(reason)
  })
  return { error }
}

describe("icReactor", () => {
  const mockOptions: IcReactorPluginOptions = {
    canisters: [
      {
        name: "test_canister",
        didFile: DID_RELATIVE,
        outDir: "src/declarations/test_canister",
      },
    ],
    outDir: "src/declarations",
  }

  const mockServer: any = {
    config: {
      root: VITE_ROOT,
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
      on: vi.fn(),
    },
    watcher: {
      add: vi.fn(),
    },
  }

  /**
   * Drive the plugin through the hooks Vite runs before `buildStart`.
   *
   * Called optionally on purpose: the structure test above is what asserts the
   * hook exists, and without the `?.` a plugin that lost `configResolved` would
   * make every test below fail with a TypeError instead of failing on the path
   * it actually resolved.
   */
  const resolveConfig = (plugin: any, command: "build" | "serve" = "build") =>
    plugin.configResolved?.({ root: VITE_ROOT, command })

  beforeEach(() => {
    vi.resetAllMocks()
    ;(runCanisterPipeline as any).mockResolvedValue({
      success: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should return correct plugin structure", () => {
    const plugin = createVitePlugin(mockOptions)
    expect(plugin.name).toBe("ic-reactor-plugin")
    expect(plugin.buildStart).toBeDefined()
    expect(plugin.handleHotUpdate).toBeDefined()
    expect(plugin.configResolved).toBeDefined()
    expect((plugin as any).config).toBeDefined()
  })

  describe("config", () => {
    it("should set up API proxy and headers when icp-cli is available", () => {
      ;(execFileSync as any).mockImplementation(
        (command: string, args: string[], _options: any) => {
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

      const plugin = createVitePlugin(mockOptions)
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

    it("should prefer configured canisterId over CLI-discovered env values", () => {
      ;(execFileSync as any).mockImplementation(
        (command: string, args: string[], _options: any) => {
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
            return "local-cli-canister-id"
          }
          return ""
        }
      )

      const plugin = createVitePlugin({
        ...mockOptions,
        canisters: [
          {
            ...mockOptions.canisters[0],
            canisterId: "yq4ns-hyaaa-aaaap-akbna-cai",
          },
        ],
      })
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers["Set-Cookie"]).toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dyq4ns-hyaaa-aaaap-akbna-cai"
      )
      expect(config.server.headers["Set-Cookie"]).not.toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dlocal-cli-canister-id"
      )
    })

    it("should inject built-in local Internet Identity provider when no project II canister is found", () => {
      ;(execFileSync as any).mockImplementation(
        (command: string, args: string[], _options: any) => {
          if (
            command === "icp" &&
            args.includes("network") &&
            args.includes("status")
          ) {
            return JSON.stringify({
              root_key: "mock-root-key",
              api_url: "http://localhost:8000/",
            })
          }
          if (
            command === "icp" &&
            args.includes("canister") &&
            args.includes("status")
          ) {
            if (args.includes("internet_identity")) {
              throw new Error("system canister is not a project canister")
            }
            return "mock-canister-id"
          }
          return ""
        }
      )

      const plugin = createVitePlugin(mockOptions)
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers["Set-Cookie"]).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://localhost:8000/")
    })

    it("should fallback to default proxy when icp-cli fails", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      ;(execFileSync as any).mockImplementation(() => {
        throw new Error("Command not found")
      })

      const plugin = createVitePlugin(mockOptions)
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers).toBeUndefined()
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
      // Silent detection failure is indistinguishable from a working setup
      // until the app blows up on an undefined canister id at runtime.
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not detect the local IC environment")
      )
    })

    // The replica being UP while a configured canister is simply not deployed is
    // the common case, and it takes the success branch: icEnv is truthy, so the
    // "could not detect" warning never fires. Without a second check the cookie
    // goes out with a root key and no PUBLIC_CANISTER_ID, which is exactly the
    // silent failure the warning above exists to prevent.
    it("should warn when the replica is up but a configured canister has no id", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      ;(execFileSync as any).mockImplementation(
        (command: string, args: string[]) => {
          if (
            command === "icp" &&
            args.includes("network") &&
            args.includes("status")
          ) {
            return JSON.stringify({ root_key: "mock-root-key", port: 4943 })
          }
          // Never deployed: every canister status fails.
          if (args.includes("canister") && args.includes("status")) {
            throw new Error("canister not found")
          }
          return ""
        }
      )

      const plugin = createVitePlugin(mockOptions)
      const result = (plugin as any).config({}, { command: "serve" })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("no canister ID could be resolved")
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("test")
      )
      // The cookie still went out, which is why the warning is the only signal.
      const cookie = result?.server?.headers?.["Set-Cookie"] ?? ""
      expect(cookie).not.toContain("PUBLIC_CANISTER_ID")
    })

    it("should stay quiet about failed detection when no canisters are configured", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      ;(execFileSync as any).mockImplementation(() => {
        throw new Error("project manifest not found")
      })

      const plugin = createVitePlugin({ canisters: [] })
      ;(plugin as any).config({}, { command: "serve" })

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it("should surface the icp stderr at debug level", () => {
      const consoleDebugSpy = vi
        .spyOn(console, "debug")
        .mockImplementation(() => {})
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.stubEnv("DEBUG", "ic-reactor")
      ;(execFileSync as any).mockImplementation(() => {
        const error: any = new Error("Command failed: icp network status")
        error.stderr = Buffer.from("error: no local network is running\n")
        throw error
      })

      const plugin = createVitePlugin(mockOptions)
      ;(plugin as any).config({}, { command: "serve" })

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("no local network is running")
      )

      vi.unstubAllEnvs()
    })

    it("should inject default local II provider in env-only mode when icp-cli project detection fails", () => {
      ;(execFileSync as any).mockImplementation(() => {
        throw new Error("project manifest not found")
      })

      const plugin = createVitePlugin({ canisters: [] })
      const config = (plugin as any).config({}, { command: "serve" })

      expect(config.server.headers["Set-Cookie"]).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
    })

    it("should return empty config for build command", () => {
      const plugin = createVitePlugin(mockOptions)
      const config = (plugin as any).config({}, { command: "build" })

      expect(config).toEqual({})
    })
  })

  describe("buildStart", () => {
    it("should generate declarations and reactor file", async () => {
      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin)
      await (plugin.buildStart as any).call(buildContext())

      expect(runCanisterPipeline).toHaveBeenCalledWith({
        canisterConfig: mockOptions.canisters[0],
        projectRoot: VITE_ROOT,
        globalConfig: {
          outDir: "src/declarations",
          clientManagerPath: "../../clients",
          target: "react",
        },
      })
    })

    it("should resolve the project root from the Vite config, not the cwd", async () => {
      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin)
      await (plugin.buildStart as any).call(buildContext())

      const { projectRoot } = (runCanisterPipeline as any).mock.calls[0][0]
      expect(projectRoot).toBe(VITE_ROOT)
      expect(projectRoot).not.toBe(process.cwd())
    })

    it("should fail the build when a canister fails to generate", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "DID file not found",
      })

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "build")
      const context = buildContext()

      // `vite build` used to exit 0 here and ship whatever stale bindings were
      // left on disk from the previous successful run.
      await expect(
        (plugin.buildStart as any).call(context)
      ).rejects.toThrowError(/test_canister: DID file not found/)
      expect(context.error).toHaveBeenCalledOnce()

      consoleErrorSpy.mockRestore()
    })

    it("should fail the build when the pipeline throws", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockRejectedValue(
        new Error("Unexpected token at line 3")
      )

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "build")

      await expect(
        (plugin.buildStart as any).call(buildContext())
      ).rejects.toThrowError(/test_canister: Unexpected token at line 3/)
    })

    it("should name every failing canister in one build error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockImplementation(
        async ({ canisterConfig }: any) => ({
          success: false,
          error: `${canisterConfig.name} is broken`,
        })
      )

      const plugin = createVitePlugin({
        canisters: [
          { name: "alpha", didFile: "alpha.did" },
          { name: "beta", didFile: "beta.did" },
        ],
      })
      resolveConfig(plugin, "build")

      await expect(
        (plugin.buildStart as any).call(buildContext())
      ).rejects.toThrowError(/alpha is broken[\s\S]*beta is broken/)
    })

    it("should keep the dev server alive on failure and report to the overlay", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "Failed to generate",
      })

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")
      ;(plugin.configureServer as any)(mockServer)
      const context = buildContext()

      await (plugin.buildStart as any).call(context)

      expect(context.error).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_canister: Failed to generate")
      )
      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("test_canister: Failed to generate"),
          plugin: "ic-reactor-plugin",
        }),
      })
    })

    it("should honour an explicit failOnError override in dev", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "Failed to generate",
      })

      const plugin = createVitePlugin({ ...mockOptions, failOnError: true })
      resolveConfig(plugin, "serve")

      await expect(
        (plugin.buildStart as any).call(buildContext())
      ).rejects.toThrowError(/Failed to generate/)
    })

    it("should not fail the build when failOnError is disabled", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "Failed to generate",
      })

      const plugin = createVitePlugin({ ...mockOptions, failOnError: false })
      resolveConfig(plugin, "build")
      const context = buildContext()

      await (plugin.buildStart as any).call(context)

      expect(context.error).not.toHaveBeenCalled()
    })

    it("should pass canister mode through to codegen via canister config", async () => {
      const plugin = createVitePlugin({
        canisters: [
          {
            ...mockOptions.canisters[0],
            mode: "Reactor",
          },
        ],
        outDir: mockOptions.outDir,
      })
      resolveConfig(plugin)

      await (plugin.buildStart as any).call(buildContext())

      expect(runCanisterPipeline).toHaveBeenCalledWith({
        canisterConfig: {
          ...mockOptions.canisters[0],
          mode: "Reactor",
        },
        projectRoot: VITE_ROOT,
        globalConfig: {
          outDir: "src/declarations",
          clientManagerPath: "../../clients",
          target: "react",
        },
      })
    })

    it("should pass the configured runtime target to codegen", async () => {
      const plugin = createVitePlugin({
        ...mockOptions,
        target: "core",
      })
      resolveConfig(plugin)

      await (plugin.buildStart as any).call(buildContext())

      expect(runCanisterPipeline).toHaveBeenCalledWith({
        canisterConfig: mockOptions.canisters[0],
        projectRoot: VITE_ROOT,
        globalConfig: {
          outDir: "src/declarations",
          clientManagerPath: "../../clients",
          target: "core",
        },
      })
    })
  })

  describe("handleHotUpdate", () => {
    it("should register configured .did files against the Vite root", () => {
      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")
      ;(plugin.configureServer as any)(mockServer)

      expect(mockServer.watcher.add).toHaveBeenCalledWith([DID_IN_VITE_ROOT])
    })

    it("should regenerate for a .did file resolved against the Vite root", async () => {
      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")

      await (plugin.handleHotUpdate as any)({
        file: DID_IN_VITE_ROOT,
        server: mockServer,
      })

      expect(runCanisterPipeline).toHaveBeenCalledOnce()
      expect(mockServer.ws.send).toHaveBeenCalledWith({ type: "full-reload" })
    })

    it("should ignore a same-named .did file under the process cwd", async () => {
      // Skipped when the cwd happens to be the mocked Vite root; the two paths
      // are meant to differ, which is the whole point of the assertion.
      if (DID_IN_CWD === DID_IN_VITE_ROOT) return

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")

      await (plugin.handleHotUpdate as any)({
        file: DID_IN_CWD,
        server: mockServer,
      })

      expect(runCanisterPipeline).not.toHaveBeenCalled()
      expect(mockServer.ws.send).not.toHaveBeenCalled()
    })

    it("should ignore other files", async () => {
      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")

      await (plugin.handleHotUpdate as any)({
        file: "/some/other/file.ts",
        server: mockServer,
      })

      expect(mockServer.ws.send).not.toHaveBeenCalled()
    })

    it("should send a regeneration failure to the browser overlay", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "Unexpected token 'srevice'",
      })

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")

      await (plugin.handleHotUpdate as any)({
        file: DID_IN_VITE_ROOT,
        server: mockServer,
      })

      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("Unexpected token 'srevice'"),
          plugin: "ic-reactor-plugin",
        }),
      })
      expect(mockServer.ws.send).not.toHaveBeenCalledWith({
        type: "full-reload",
      })
    })

    it("should send a thrown regeneration error to the browser overlay", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockRejectedValue(
        new Error("parser panicked")
      )

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")

      await (plugin.handleHotUpdate as any)({
        file: DID_IN_VITE_ROOT,
        server: mockServer,
      })

      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("parser panicked"),
        }),
      })
    })

    it("should serialize regeneration for rapid saves of the same .did file", async () => {
      let releaseFirstRun: (result: unknown) => void = () => {}
      ;(runCanisterPipeline as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRun = resolve
          })
      )

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")
      const ctx = { file: DID_IN_VITE_ROOT, server: mockServer }

      const first = (plugin.handleHotUpdate as any)(ctx)
      const second = (plugin.handleHotUpdate as any)(ctx)

      // The second save must not enter the pipeline's delete-then-write
      // sequence while the first one is still inside it.
      expect(runCanisterPipeline).toHaveBeenCalledOnce()

      releaseFirstRun({ success: true })
      await Promise.all([first, second])

      // ...but it must not be dropped either: the last saved .did has to win.
      expect(runCanisterPipeline).toHaveBeenCalledTimes(2)
    })

    it("should collapse a burst of saves into a single trailing rerun", async () => {
      let releaseFirstRun: (result: unknown) => void = () => {}
      ;(runCanisterPipeline as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstRun = resolve
          })
      )

      const plugin = createVitePlugin(mockOptions)
      resolveConfig(plugin, "serve")
      const ctx = { file: DID_IN_VITE_ROOT, server: mockServer }

      const pending = [
        (plugin.handleHotUpdate as any)(ctx),
        (plugin.handleHotUpdate as any)(ctx),
        (plugin.handleHotUpdate as any)(ctx),
        (plugin.handleHotUpdate as any)(ctx),
      ]

      releaseFirstRun({ success: true })
      await Promise.all(pending)

      expect(runCanisterPipeline).toHaveBeenCalledTimes(2)
    })
  })
})
