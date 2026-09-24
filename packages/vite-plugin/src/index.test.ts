import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vitePluginModule from "./index.js"
import type { IcReactorPluginOptions } from "./index.js"
import path from "node:path"
import { execFile } from "child_process"
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
  execFile: vi.fn(),
}))

/**
 * Answer each `icp` command with what `answer` returns for its arguments: its
 * stdout, or an Error to fail with. An Error's `stderr` is passed on as the
 * command's stderr. The callback runs later, as a real child process's does.
 */
function mockIcp(answer: (args: string[]) => string | Error) {
  ;(execFile as any).mockImplementation(
    (_file: string, args: string[], _options: unknown, callback: any) => {
      const result = answer(args)
      setImmediate(() => {
        if (result instanceof Error) {
          callback(result, "", (result as { stderr?: string }).stderr ?? "")
        } else {
          callback(null, result, "")
        }
      })
      return { stdin: { end: vi.fn() } }
    }
  )
}

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
    /** Every canister id `icp` reports, by canister name. */
    type Deployed = Record<string, string>

    /**
     * Answer each `icp` command the plugin runs: the network status, or
     * `network` as the error it fails with, and each canister's id from
     * `deployed`, failing for a canister that is not in it.
     */
    const answerIcp = (
      deployed: Deployed,
      network: Record<string, unknown> | Error = {
        root_key: "mock-root-key",
        port: 4943,
      }
    ) =>
      mockIcp((args) => {
        if (args[0] === "network") {
          return network instanceof Error ? network : JSON.stringify(network)
        }
        return deployed[args[2]] ?? new Error(`canister ${args[2]} not found`)
      })

    /** How many `icp` commands the plugin has run. */
    const icpCalls = () => (execFile as any).mock.calls.length

    /**
     * Run the config hook as `vite dev` does, then configureServer, and return
     * the config and the middleware that sets the cookie.
     */
    const serveWithEnvironment = async (plugin: any, userConfig = {}) => {
      const config = await plugin.config(userConfig, { command: "serve" })
      mockServer.middlewares.use.mockClear()
      plugin.configureServer(mockServer)
      const middleware = mockServer.middlewares.use.mock.calls[0]?.[0]
      return { config, middleware }
    }

    /** A page load. */
    const PAGE = { method: "GET", accept: "text/html,application/xhtml+xml" }
    /** A module or `fetch` request, which is not a page load. */
    const MODULE = { method: "GET", accept: "*/*" }

    /** Send `middleware` a request and return the Set-Cookie it added. */
    const request = async (
      middleware: any,
      { method, accept }: { method: string; accept: string } = PAGE
    ): Promise<string | undefined> => {
      const headers = new Map<string, unknown>()
      const res = {
        getHeader: (name: string) => headers.get(name.toLowerCase()),
        setHeader: (name: string, value: unknown) => {
          headers.set(name.toLowerCase(), value)
        },
      }
      await new Promise<void>((resolve, reject) =>
        middleware({ method, headers: { accept } }, res, (error?: unknown) =>
          error ? reject(error) : resolve()
        )
      )
      const cookie = headers.get("set-cookie")
      return cookie === undefined ? undefined : String(cookie)
    }

    it("should set up the API proxy and the cookie when icp-cli is available", async () => {
      answerIcp({ test_canister: "mock-canister-id" })

      const plugin = createVitePlugin(mockOptions)
      const { config, middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain("ic_env=")
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id"
      )
      expect(cookie).toContain("ic_root_key%3Dmock-root-key")
      expect(cookie).toContain("; Path=/; SameSite=Lax;")
      expect(config.server.proxy["/api"]).toMatchObject({
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      })
      // Set per response by the middleware, not fixed at startup.
      expect(config.server.headers).toBeUndefined()
    })

    // icp looks for icp.yaml in its working directory and the directories above
    // it. `vite apps/web` from a monorepo root, or `root` in the config, leaves
    // the process cwd outside the app, so icp has to start from Vite's root.
    it("should run icp from the Vite root rather than the process cwd", async () => {
      answerIcp({ test_canister: "mock-canister-id" })

      const plugin = createVitePlugin(mockOptions)
      await plugin.config({ root: "apps/web" }, { command: "serve" })

      const workingDirs = (execFile as any).mock.calls.map(
        ([, , options]: any) => options?.cwd
      )
      expect(workingDirs.length).toBeGreaterThan(1)
      expect(new Set(workingDirs)).toEqual(new Set([path.resolve("apps/web")]))
    })

    it("should prefer configured canisterId over CLI-discovered env values", async () => {
      answerIcp({ test_canister: "local-cli-canister-id" })

      const plugin = createVitePlugin({
        ...mockOptions,
        canisters: [
          {
            ...mockOptions.canisters[0],
            canisterId: "yq4ns-hyaaa-aaaap-akbna-cai",
          },
        ],
      })
      const { middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dyq4ns-hyaaa-aaaap-akbna-cai"
      )
      expect(cookie).not.toContain("local-cli-canister-id")
    })

    it("should inject built-in local Internet Identity provider when no project II canister is found", async () => {
      answerIcp(
        { test_canister: "mock-canister-id" },
        { root_key: "mock-root-key", api_url: "http://localhost:8000/" }
      )

      const plugin = createVitePlugin(mockOptions)
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://localhost:8000/")
    })

    it("should fallback to default proxy when icp-cli fails", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      mockIcp(() => new Error("Command not found"))

      const plugin = createVitePlugin(mockOptions)
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toBeUndefined()
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
      // Silent detection failure is indistinguishable from a working setup
      // until the app blows up on an undefined canister id at runtime. The
      // warning says what the plugin does about it.
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      const [warning] = consoleWarnSpy.mock.calls[0]
      expect(warning).toContain("Could not detect the local IC environment")
      expect(warning).toContain("/api goes to http://127.0.0.1:4943 for now")
      expect(warning).toContain(
        "asks `icp` again on each page load until it answers"
      )
      expect(warning).toContain("reload the page")
    })

    // The replica being UP while a configured canister is simply not deployed
    // is the common case: `vite dev` usually starts before `icp deploy`.
    it("should warn when the replica is up but a configured canister has no id", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      answerIcp({})

      const plugin = createVitePlugin(mockOptions)
      const { middleware } = await serveWithEnvironment(plugin)

      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      const [warning] = consoleWarnSpy.mock.calls[0]
      expect(warning).toContain(
        'no canister ID could be resolved for "test_canister"'
      )
      // It used to promise that deploying was enough, while the cookie stayed
      // without the id until the dev server restarted.
      expect(warning).toContain(
        "Deploy it (`icp deploy`) and reload the page: the plugin asks `icp` " +
          "again on each page load until every configured canister has an ID."
      )
      const cookie = await request(middleware)
      expect(cookie).toContain("ic_root_key%3Dmock-root-key")
      expect(cookie).not.toContain("PUBLIC_CANISTER_ID")
    })

    it("should stay quiet about failed detection when no canisters are configured", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      mockIcp(() => new Error("project manifest not found"))

      const plugin = createVitePlugin({ canisters: [] })
      await plugin.config({}, { command: "serve" })

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it("should surface the icp stderr at debug level", async () => {
      const consoleDebugSpy = vi
        .spyOn(console, "debug")
        .mockImplementation(() => {})
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.stubEnv("DEBUG", "ic-reactor")
      mockIcp(() =>
        Object.assign(new Error("Command failed: icp network status"), {
          stderr: "error: no local network is running\n",
        })
      )

      const plugin = createVitePlugin(mockOptions)
      await plugin.config({}, { command: "serve" })

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("no local network is running")
      )

      vi.unstubAllEnvs()
    })

    it("should inject default local II provider in env-only mode when icp-cli project detection fails", async () => {
      mockIcp(() => new Error("project manifest not found"))

      const plugin = createVitePlugin({ canisters: [] })
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:4943")
    })

    it("should return empty config for build command", async () => {
      const plugin = createVitePlugin(mockOptions)
      const config = await (plugin as any).config({}, { command: "build" })

      expect(config).toEqual({})
      expect(execFile).not.toHaveBeenCalled()
    })

    it("should add no middleware when injectEnvironment is off", async () => {
      const plugin = createVitePlugin({
        ...mockOptions,
        injectEnvironment: false,
      })
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(config).toEqual({})
      expect(middleware).toBeUndefined()
      expect(execFile).not.toHaveBeenCalled()
    })

    // `vite preview` resolves the config with the `serve` command, and used to
    // get the cookie through `preview.headers`, which defaults to
    // `server.headers`.
    it("should set the cookie on the preview server too", async () => {
      answerIcp({ test_canister: "mock-canister-id" })

      const plugin = createVitePlugin(mockOptions)
      await plugin.config({}, { command: "serve" })
      const previewServer = { middlewares: { use: vi.fn() } }
      plugin.configurePreviewServer(previewServer)

      expect(
        await request(previewServer.middlewares.use.mock.calls[0][0])
      ).toContain("PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id")
    })

    // `vite dev` usually starts before the canister is deployed. The cookie
    // was fixed at startup, so after `icp deploy` every reload still lacked the
    // id until the dev server restarted (#664).
    describe("while detection is incomplete", () => {
      it("should give a page load after a deploy the new canister's id", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const consoleLogSpy = vi
          .spyOn(console, "log")
          .mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        expect(await request(middleware)).not.toContain("PUBLIC_CANISTER_ID")

        answerIcp({ test_canister: "bkyz2-fmaaa-aaaaa-qaaaq-cai" })

        expect(await request(middleware)).toContain(
          "PUBLIC_CANISTER_ID%3Atest_canister%3Dbkyz2-fmaaa-aaaaa-qaaaq-cai"
        )
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[ic-reactor] The ic_env cookie now carries the canister ID for "test_canister".'
        )
      })

      it("should pick up a network that was down at startup and send /api to it", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const consoleLogSpy = vi
          .spyOn(console, "log")
          .mockImplementation(() => {})
        answerIcp({}, new Error("no local network is running"))
        const plugin = createVitePlugin(mockOptions)
        const { config, middleware } = await serveWithEnvironment(plugin)

        // Vite builds the proxy from a copy of the entry and hands that copy to
        // `configure`. It reads the target from it on every request.
        const apiEntry = config.server.proxy["/api"]
        const proxyOptions = { ...apiEntry }
        apiEntry.configure({}, proxyOptions)
        expect(proxyOptions.target).toBe("http://127.0.0.1:4943")
        expect(await request(middleware)).toBeUndefined()

        answerIcp(
          { test_canister: "bkyz2-fmaaa-aaaaa-qaaaq-cai" },
          { root_key: "fresh-root-key", api_url: "http://127.0.0.1:8000" }
        )

        const cookie = await request(middleware)
        expect(cookie).toContain("ic_root_key%3Dfresh-root-key")
        expect(cookie).toContain(
          "PUBLIC_CANISTER_ID%3Atest_canister%3Dbkyz2-fmaaa-aaaaa-qaaaq-cai"
        )
        expect(proxyOptions.target).toBe("http://127.0.0.1:8000")
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key and /api goes to http://127.0.0.1:8000."
        )
      })

      it("should not run icp for a request that is not a page load", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        const cookie = await request(middleware, MODULE)
        await request(middleware, { method: "POST", accept: "text/html" })

        expect(icpCalls()).toBe(calls)
        // It still carries what the last detection found.
        expect(cookie).toContain("ic_root_key%3Dmock-root-key")
      })

      it("should share one detection between page loads that arrive together", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        await Promise.all([request(middleware), request(middleware)])

        const networkStatusCalls = (execFile as any).mock.calls
          .slice(calls)
          .filter(([, args]: any) => args[0] === "network")
        expect(networkStatusCalls).toHaveLength(1)
      })

      // A command can fail for a moment while `icp deploy` runs. The cookie
      // that already worked must survive that page load.
      it("should keep what it detected when icp fails for a moment", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const plugin = createVitePlugin({
          canisters: [
            { name: "alpha", didFile: "alpha.did" },
            { name: "beta", didFile: "beta.did" },
          ],
        })
        answerIcp({ alpha: "alpha-id" })
        const { middleware } = await serveWithEnvironment(plugin)

        // The network status fails outright.
        answerIcp({}, new Error("lock held by another icp process"))
        let cookie = await request(middleware)
        expect(cookie).toContain("ic_root_key%3Dmock-root-key")
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Aalpha%3Dalpha-id")

        // The network answers, but alpha's lookup fails.
        answerIcp({ beta: "beta-id" })
        cookie = await request(middleware)
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Aalpha%3Dalpha-id")
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Abeta%3Dbeta-id")
      })

      it("should not name the built-in Internet Identity next to a kept internet_identity id", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const localhost = {
          root_key: "mock-root-key",
          api_url: "http://localhost:8000",
        }
        answerIcp({ internet_identity: "ii-id" }, localhost)
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)

        // internet_identity's lookup fails this time.
        answerIcp({}, localhost)
        const cookie = await request(middleware)

        expect(cookie).toContain(
          "PUBLIC_CANISTER_ID%3Ainternet_identity%3Dii-id"
        )
        expect(cookie).not.toContain("INTERNET_IDENTITY_PROVIDER")
      })

      it("should drop the ids of a network whose root key changed", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const plugin = createVitePlugin({
          canisters: [
            { name: "alpha", didFile: "alpha.did" },
            { name: "beta", didFile: "beta.did" },
          ],
        })
        answerIcp({ alpha: "alpha-id" })
        const { middleware } = await serveWithEnvironment(plugin)

        answerIcp(
          { beta: "beta-id" },
          { root_key: "fresh-root-key", port: 4943 }
        )
        const cookie = await request(middleware)

        expect(cookie).toContain("ic_root_key%3Dfresh-root-key")
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Abeta%3Dbeta-id")
        expect(cookie).not.toContain("alpha-id")
      })
    })

    describe("once every configured canister has an id", () => {
      it("should run no icp command for a page load", async () => {
        answerIcp({ test_canister: "mock-canister-id" })
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        for (let load = 0; load < 3; load++) {
          expect(await request(middleware)).toContain(
            "PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id"
          )
        }

        expect(icpCalls()).toBe(calls)
      })

      it("should stop running icp after a page load resolves the last id", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const consoleLogSpy = vi
          .spyOn(console, "log")
          .mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)

        answerIcp({ test_canister: "mock-canister-id" })
        await request(middleware)
        const calls = icpCalls()
        await request(middleware)
        await request(middleware)

        expect(icpCalls()).toBe(calls)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Every configured canister has an ID, so page loads no longer run `icp`."
          )
        )
      })

      // A canister id set in the plugin config counts as resolved.
      it("should count a configured canisterId as resolved", async () => {
        answerIcp({})
        const plugin = createVitePlugin({
          ...mockOptions,
          canisters: [
            {
              ...mockOptions.canisters[0],
              canisterId: "yq4ns-hyaaa-aaaap-akbna-cai",
            },
          ],
        })
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        await request(middleware)

        expect(icpCalls()).toBe(calls)
      })
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
        answerIcp({ test_canister: "mock-canister-id" })

        const plugin = createVitePlugin(mockOptions)
        const resolved = await resolveWithUserProxy(plugin)

        expect(resolved.server.proxy?.["/api"]).toEqual(userApiProxy)
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          expect.stringContaining("already proxies /api")
        )
        // Everything else the plugin injects still arrives.
        mockServer.middlewares.use.mockClear()
        plugin.configureServer(mockServer)
        expect(
          await request(mockServer.middlewares.use.mock.calls[0][0])
        ).toContain("ic_root_key%3Dmock-root-key")
      })

      it.each([
        ["with canisters configured", mockOptions],
        ["in env-only mode", { canisters: [] }],
      ])(
        "should keep the user's proxy when detection fails %s",
        async (_label, options) => {
          vi.spyOn(console, "warn").mockImplementation(() => {})
          mockIcp(() => new Error("project manifest not found"))

          const resolved = await resolveWithUserProxy(createVitePlugin(options))

          expect(resolved.server.proxy?.["/api"]).toEqual(userApiProxy)
        }
      )

      // The warning must not claim a target the plugin does not proxy to.
      it("should leave /api out of the warning", async () => {
        const consoleWarnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {})
        mockIcp(() => new Error("project manifest not found"))

        await resolveWithUserProxy(createVitePlugin(mockOptions))

        expect(consoleWarnSpy).toHaveBeenCalledOnce()
        expect(consoleWarnSpy.mock.calls[0][0]).not.toContain("/api")
      })
    })

    it("should still proxy /api when the Vite config proxies only other paths", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      mockIcp(() => new Error("project manifest not found"))

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
        "/api": {
          target: "http://127.0.0.1:4943",
          changeOrigin: true,
          configure: expect.any(Function),
        },
      })
    })

    // A plugin whose config hook runs after this one can proxy /api as well.
    // Vite merges its entry over the plugin's own and keeps the plugin's
    // `configure`, which then took /api back to the detected network.
    it("should leave /api where a later plugin points it", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {})
      answerIcp({}, new Error("no local network is running"))
      const plugin = createVitePlugin(mockOptions)
      const laterTarget = "http://127.0.0.1:3000"

      const resolved = await resolveViteConfig(
        {
          configFile: false,
          logLevel: "silent",
          plugins: [
            plugin,
            {
              name: "later-api-proxy",
              config: () => ({
                server: { proxy: { "/api": { target: laterTarget } } },
              }),
            },
          ],
        },
        "serve"
      )
      const apiEntry = resolved.server.proxy?.["/api"] as any
      const proxyOptions = { ...apiEntry }
      apiEntry.configure({}, proxyOptions)
      expect(proxyOptions.target).toBe(laterTarget)

      // The network comes up on another port. The cookie follows it, /api
      // stays with the later plugin, and the terminal does not claim it moved.
      answerIcp(
        { test_canister: "mock-canister-id" },
        { root_key: "mock-root-key", api_url: "http://127.0.0.1:8000" }
      )
      mockServer.middlewares.use.mockClear()
      plugin.configureServer(mockServer)
      expect(
        await request(mockServer.middlewares.use.mock.calls[0][0])
      ).toContain("ic_root_key%3Dmock-root-key")

      expect(proxyOptions.target).toBe(laterTarget)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key."
      )
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
