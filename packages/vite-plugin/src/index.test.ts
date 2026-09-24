import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vitePluginModule from "./index.js"
import type { IcReactorPluginOptions } from "./index.js"
import path from "node:path"
import { execFileSync } from "child_process"
import { runCanisterPipeline } from "@ic-reactor/codegen"
import { resolveConfig as resolveViteConfig } from "vite"

const createVitePlugin =
  (vitePluginModule as any).icReactor ??
  (vitePluginModule as any).icReactorPlugin

// Mock the pipeline. The shared-outDir check only resolves paths, so it runs
// for real: it is what decides whether the plugin calls the pipeline at all.
vi.mock("@ic-reactor/codegen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ic-reactor/codegen")>()),
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
  return { error, addWatchFile: vi.fn(), meta: { watchMode: false } }
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
      on: vi.fn(),
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
    expect(plugin.configureServer).toBeDefined()
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

    // icp looks for icp.yaml in its working directory and the directories above
    // it. `vite apps/web` from a monorepo root, or `root` in the config, leaves
    // the process cwd outside the app, so icp has to start from Vite's root.
    it("should run icp from the Vite root rather than the process cwd", () => {
      ;(execFileSync as any).mockImplementation(
        (_command: string, args: string[]) =>
          args[0] === "network"
            ? JSON.stringify({ root_key: "mock-root-key", port: 4943 })
            : "mock-canister-id"
      )

      const plugin = createVitePlugin(mockOptions)
      ;(plugin as any).config({ root: "apps/web" }, { command: "serve" })

      const workingDirs = (execFileSync as any).mock.calls.map(
        ([, , options]: any) => options?.cwd
      )
      expect(workingDirs.length).toBeGreaterThan(1)
      expect(new Set(workingDirs)).toEqual(new Set([path.resolve("apps/web")]))
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

    // Vite deep-merges what a plugin's config hook returns over the user's
    // config, so the /api entry the plugin returned replaced the user's own.
    // examples/codegen-in-action proxies /api to icp-cli's port 8000 and got
    // 4943. These run Vite's real resolveConfig, which does that merge.
    describe("with a Vite config that already proxies /api", () => {
      const userApiProxy = {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      }

      const resolveWithUserProxy = (plugin: any) =>
        resolveViteConfig(
          {
            configFile: false,
            logLevel: "silent",
            plugins: [plugin],
            server: { proxy: { "/api": userApiProxy } },
          },
          "serve"
        )

      afterEach(() => {
        vi.unstubAllEnvs()
      })

      it("should keep the user's proxy when icp detection succeeds", async () => {
        const consoleDebugSpy = vi
          .spyOn(console, "debug")
          .mockImplementation(() => {})
        vi.stubEnv("DEBUG", "ic-reactor")
        ;(execFileSync as any).mockImplementation(
          (command: string, args: string[]) => {
            if (command === "icp" && args.includes("network")) {
              return JSON.stringify({ root_key: "mock-root-key", port: 4943 })
            }
            return "mock-canister-id"
          }
        )

        const resolved = await resolveWithUserProxy(
          createVitePlugin(mockOptions)
        )

        expect(resolved.server.proxy?.["/api"]).toEqual(userApiProxy)
        // Everything else the plugin injects still arrives.
        expect(resolved.server.headers?.["Set-Cookie"]).toContain(
          "ic_root_key%3Dmock-root-key"
        )
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          expect.stringContaining("already proxies /api")
        )
      })

      it.each([
        ["with canisters configured", mockOptions],
        ["in env-only mode", { canisters: [] }],
      ])(
        "should keep the user's proxy when detection fails %s",
        async (_label, options) => {
          vi.spyOn(console, "warn").mockImplementation(() => {})
          ;(execFileSync as any).mockImplementation(() => {
            throw new Error("project manifest not found")
          })

          const resolved = await resolveWithUserProxy(createVitePlugin(options))

          expect(resolved.server.proxy?.["/api"]).toEqual(userApiProxy)
        }
      )
    })

    it("should still proxy /api when the Vite config proxies only other paths", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      ;(execFileSync as any).mockImplementation(() => {
        throw new Error("project manifest not found")
      })

      const resolved = await resolveViteConfig(
        {
          configFile: false,
          logLevel: "silent",
          plugins: [createVitePlugin(mockOptions)],
          server: { proxy: { "/assets": "http://127.0.0.1:9000" } },
        },
        "serve"
      )

      expect(resolved.server.proxy).toEqual({
        "/assets": "http://127.0.0.1:9000",
        "/api": { target: "http://127.0.0.1:4943", changeOrigin: true },
      })
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

    it("should watch every configured .did file so a watch build rebuilds when one is saved", async () => {
      const absoluteDid = path.resolve("/elsewhere/ledger.did")
      const plugin = createVitePlugin({
        canisters: [
          { name: "test_canister", didFile: DID_RELATIVE },
          { name: "ledger", didFile: absoluteDid },
        ],
      })
      resolveConfig(plugin)
      const context = buildContext()

      await (plugin.buildStart as any).call(context)

      // A .did file is never in the module graph, so `vite build --watch`
      // ignored a save to one until buildStart registered it.
      expect(context.addWatchFile.mock.calls).toEqual([
        [DID_IN_VITE_ROOT],
        [absoluteDid],
      ])
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

    // Two entries with one name and one outDir generated into one directory at
    // once, and which one's output survived changed from run to run.
    const sharedOutDirEntries = {
      canisters: [
        { name: "backend", didFile: DID_RELATIVE, mode: "Reactor" as const },
        { name: "backend", didFile: DID_RELATIVE },
      ],
    }
    const SHARED_OUT_DIR_MESSAGE =
      'canisters[1] ("backend"): generates into the same output directory as ' +
      'canisters[0] ("backend"). Each run replaces that directory\'s declarations ' +
      "and index.generated.ts, so the two would overwrite each other. Give each " +
      'canister its own "outDir", or its own "name" if it uses the global outDir.'

    it("should fail the build for an entry that shares a name and an outDir with an earlier one", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const plugin = createVitePlugin(sharedOutDirEntries)
      resolveConfig(plugin, "build")

      await expect(
        (plugin.buildStart as any).call(buildContext())
      ).rejects.toThrowError(
        `Failed to generate 1 of 2 canisters:\n  - ${SHARED_OUT_DIR_MESSAGE}`
      )
      // Only the first entry generated.
      expect(
        (runCanisterPipeline as any).mock.calls.map(
          ([options]: any) => options.canisterConfig
        )
      ).toEqual([sharedOutDirEntries.canisters[0]])
    })

    it("should report an entry that shares an outDir to the overlay in dev", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const plugin = createVitePlugin(sharedOutDirEntries)
      resolveConfig(plugin, "serve")
      ;(plugin.configureServer as any)(mockServer)
      const context = buildContext()

      await (plugin.buildStart as any).call(context)

      expect(context.error).not.toHaveBeenCalled()
      expect(runCanisterPipeline).toHaveBeenCalledOnce()
      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining(SHARED_OUT_DIR_MESSAGE),
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

  describe("watching .did files", () => {
    /** Start the plugin the way `vite dev` does. */
    const serve = (plugin: any) => {
      resolveConfig(plugin, "serve")
      ;(plugin.configureServer as any)(mockServer)
    }

    /**
     * Wait for every regeneration that is not held on a promise the test
     * controls. The mocked pipeline settles in microtasks, and a timer runs
     * after all of them.
     */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

    /**
     * Report `file` to the listeners the plugin put on the dev server's
     * watcher, the way chokidar reports a file saved in place ("change") or a
     * file that appeared ("add"). The listeners run before this returns.
     */
    const emit = (event: "add" | "change", file: string) => {
      for (const [name, listener] of mockServer.watcher.on.mock.calls) {
        if (name === event) listener(file)
      }
      return settle()
    }

    it("should register configured .did files against the Vite root", () => {
      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      expect(mockServer.watcher.add).toHaveBeenCalledWith([DID_IN_VITE_ROOT])
    })

    // Vite calls `handleHotUpdate` only for a file changed in place. A .did
    // that did not exist at startup, or that a build tool or `git checkout`
    // deleted and wrote again, is an `add` event, and Vite 4 to 7 report
    // nothing else for it.
    it("should regenerate a .did file that appears while the server runs", async () => {
      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      await emit("add", DID_IN_VITE_ROOT)

      expect(runCanisterPipeline).toHaveBeenCalledOnce()
      expect(mockServer.ws.send).toHaveBeenCalledWith({ type: "full-reload" })
    })

    // With `server.hmr: false`, Vite never calls `handleHotUpdate`, so no save
    // regenerated. The watcher still reports the save.
    it("should regenerate from the watcher, whatever the HMR settings", async () => {
      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

      expect(runCanisterPipeline).toHaveBeenCalledOnce()
    })

    it("should regenerate for a .did file resolved against the Vite root", async () => {
      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

      expect(runCanisterPipeline).toHaveBeenCalledOnce()
      expect(mockServer.ws.send).toHaveBeenCalledWith({ type: "full-reload" })
    })

    // A project that deploys one canister several times, such as ICRC ledgers,
    // lists each instance as its own canister and points them all at one .did
    // file. A save has to regenerate every one of them.
    it("should regenerate every canister that shares the changed .did file", async () => {
      const plugin = createVitePlugin({
        canisters: [
          { name: "token_a", didFile: DID_RELATIVE },
          { name: "token_b", didFile: DID_RELATIVE },
        ],
      })
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

      const regenerated = (runCanisterPipeline as any).mock.calls.map(
        ([options]: any) => options.canisterConfig.name
      )
      expect(regenerated).toEqual(["token_a", "token_b"])
    })

    it("should ignore a same-named .did file under the process cwd", async () => {
      // Skipped when the cwd happens to be the mocked Vite root; the two paths
      // are meant to differ, which is the whole point of the assertion.
      if (DID_IN_CWD === DID_IN_VITE_ROOT) return

      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      await emit("change", DID_IN_CWD)

      expect(runCanisterPipeline).not.toHaveBeenCalled()
      expect(mockServer.ws.send).not.toHaveBeenCalled()
    })

    it("should ignore other files", async () => {
      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      await emit("change", "/some/other/file.ts")

      expect(mockServer.ws.send).not.toHaveBeenCalled()
    })

    it("should send a regeneration failure to the browser overlay", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValue({
        success: false,
        error: "Unexpected token 'srevice'",
      })

      const plugin = createVitePlugin(mockOptions)
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

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
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("parser panicked"),
        }),
      })
    })

    /** The listener the plugin registered for new browser connections. */
    const connectionListener = () =>
      mockServer.ws.on.mock.calls.find(
        ([event]: [string]) => event === "connection"
      )?.[1] as () => void

    const twoCanisters = {
      canisters: [
        { name: "alpha", didFile: "alpha.did" },
        { name: "beta", didFile: "beta.did" },
      ],
    }

    // A success proves only that the canister which regenerated is fixed. The
    // reload it sends brings every open tab back through a new connection, and
    // that connection still has to show the canister that is broken.
    it("should keep replaying a failure that another canister's success did not fix", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockImplementation(
        async ({ canisterConfig }: any) =>
          canisterConfig.name === "alpha"
            ? { success: false, error: "alpha.did: Unexpected token" }
            : { success: true }
      )

      const plugin = createVitePlugin(twoCanisters)
      serve(plugin)

      await (plugin.buildStart as any).call(buildContext())
      await emit("change", path.resolve(VITE_ROOT, "beta.did"))

      mockServer.ws.send.mockClear()
      connectionListener()()

      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("alpha.did: Unexpected token"),
          plugin: "ic-reactor-plugin",
        }),
      })
    })

    it("should stop replaying a failure once that canister regenerates", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockResolvedValueOnce({
        success: false,
        error: "alpha.did: Unexpected token",
      })

      const plugin = createVitePlugin(twoCanisters)
      serve(plugin)

      await emit("change", path.resolve(VITE_ROOT, "alpha.did"))
      await emit("change", path.resolve(VITE_ROOT, "alpha.did"))

      mockServer.ws.send.mockClear()
      connectionListener()()

      expect(mockServer.ws.send).not.toHaveBeenCalled()
    })

    // A shared .did file regenerates several canisters at once, and each
    // success sends a full reload. A failure in one of them has to survive that
    // reload, so the reconnecting tab still shows it.
    it("should keep a failure from a canister that shares the changed .did file after another succeeds", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      ;(runCanisterPipeline as any).mockImplementation(
        async ({ canisterConfig }: any) =>
          canisterConfig.name === "token_a"
            ? { success: false, error: "test.did: Unexpected token" }
            : { success: true }
      )

      const plugin = createVitePlugin({
        canisters: [
          { name: "token_a", didFile: DID_RELATIVE },
          { name: "token_b", didFile: DID_RELATIVE },
        ],
      })
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)
      expect(mockServer.ws.send).toHaveBeenCalledWith({ type: "full-reload" })

      mockServer.ws.send.mockClear()
      connectionListener()()

      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("test.did: Unexpected token"),
          plugin: "ic-reactor-plugin",
        }),
      })
    })

    // Two entries can share a name: one canister generated twice, as a
    // DisplayReactor and as a Reactor, each into its own outDir. The name looks
    // up the canister id, so it has to be the same, and it does not identify
    // the entry.
    const sameNameEntries = {
      canisters: [
        {
          name: "backend",
          didFile: DID_RELATIVE,
          outDir: "src/display",
          mode: "DisplayReactor" as const,
        },
        {
          name: "backend",
          didFile: DID_RELATIVE,
          outDir: "src/raw",
          mode: "Reactor" as const,
        },
      ],
    }

    it("should regenerate every entry that shares a name and the changed .did file", async () => {
      const plugin = createVitePlugin(sameNameEntries)
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

      const regenerated = (runCanisterPipeline as any).mock.calls.map(
        ([options]: any) => options.canisterConfig.outDir
      )
      expect(regenerated).toEqual(["src/display", "src/raw"])
    })

    it("should keep a failure from an entry after an entry with the same name succeeds", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      let finishDisplay: (result: unknown) => void = () => {}
      ;(runCanisterPipeline as any).mockImplementation(
        ({ canisterConfig }: any) =>
          canisterConfig.outDir === "src/display"
            ? new Promise((resolve) => {
                finishDisplay = resolve
              })
            : Promise.resolve({ success: false, error: "src/raw: EACCES" })
      )

      const plugin = createVitePlugin(sameNameEntries)
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)
      // The Reactor entry fails first, then the DisplayReactor entry succeeds.
      expect(mockServer.ws.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" })
      )
      finishDisplay({ success: true })
      await settle()
      expect(mockServer.ws.send).toHaveBeenCalledWith({ type: "full-reload" })

      mockServer.ws.send.mockClear()
      connectionListener()()

      expect(mockServer.ws.send).toHaveBeenCalledWith({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining("src/raw: EACCES"),
          plugin: "ic-reactor-plugin",
        }),
      })
    })

    it("should not regenerate an entry that shares a name and an outDir with an earlier one", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      const entries = [
        { name: "backend", didFile: DID_RELATIVE, mode: "Reactor" as const },
        { name: "backend", didFile: DID_RELATIVE },
      ]
      const plugin = createVitePlugin({ canisters: entries })
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)

      expect(
        (runCanisterPipeline as any).mock.calls.map(
          ([options]: any) => options.canisterConfig
        )
      ).toEqual([entries[0]])
      const refusal = expect.objectContaining({
        type: "error",
        err: expect.objectContaining({
          message: expect.stringContaining(
            'Regeneration failed for canisters[1] ("backend"): generates into ' +
              'the same output directory as canisters[0] ("backend").'
          ),
        }),
      })
      expect(mockServer.ws.send).toHaveBeenCalledWith(refusal)

      // A tab that connects later still sees it.
      mockServer.ws.send.mockClear()
      connectionListener()()
      expect(mockServer.ws.send).toHaveBeenCalledWith(refusal)
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
      serve(plugin)

      await emit("change", DID_IN_VITE_ROOT)
      await emit("change", DID_IN_VITE_ROOT)

      // The second save must not enter the pipeline's delete-then-write
      // sequence while the first one is still inside it.
      expect(runCanisterPipeline).toHaveBeenCalledOnce()

      releaseFirstRun({ success: true })
      await settle()

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
      serve(plugin)

      for (let save = 0; save < 4; save++) {
        await emit("change", DID_IN_VITE_ROOT)
      }

      releaseFirstRun({ success: true })
      await settle()

      expect(runCanisterPipeline).toHaveBeenCalledTimes(2)
    })
  })
})
