import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vitePluginModule from "./index.js"
import type { IcReactorPluginOptions } from "./index.js"
import path from "node:path"
import { execFile } from "child_process"
import { resolveConfig as resolveViteConfig } from "vite"

const createVitePlugin =
  (vitePluginModule as any).icReactor ??
  (vitePluginModule as any).icReactorPlugin

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

describe("icReactor", () => {
  const mockOptions: IcReactorPluginOptions = {
    canisters: { test_canister: {} },
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
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should return correct plugin structure", () => {
    const plugin = createVitePlugin(mockOptions)
    expect(plugin.name).toBe("ic-reactor-plugin")
    expect(plugin.configureServer).toBeDefined()
    expect(plugin.configurePreviewServer).toBeDefined()
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
        canisters: {
          test_canister: { canisterId: "yq4ns-hyaaa-aaaap-akbna-cai" },
        },
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
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:8000")
      // Silent detection failure is indistinguishable from a working setup
      // until the app blows up on an undefined canister id at runtime. The
      // warning says what the plugin does about it.
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      const [warning] = consoleWarnSpy.mock.calls[0]
      expect(warning).toContain("Could not detect the local IC environment")
      expect(warning).toContain("/api goes to http://127.0.0.1:8000 for now")
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

      const plugin = createVitePlugin({ canisters: {} })
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

      const plugin = createVitePlugin({ canisters: {} })
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:8000")
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
        expect(proxyOptions.target).toBe("http://127.0.0.1:8000")
        expect(await request(middleware)).toBeUndefined()

        // A gateway on another port than the fallback's, so the switch shows.
        answerIcp(
          { test_canister: "bkyz2-fmaaa-aaaaa-qaaaq-cai" },
          { root_key: "fresh-root-key", api_url: "http://127.0.0.1:8080" }
        )

        const cookie = await request(middleware)
        expect(cookie).toContain("ic_root_key%3Dfresh-root-key")
        expect(cookie).toContain(
          "PUBLIC_CANISTER_ID%3Atest_canister%3Dbkyz2-fmaaa-aaaaa-qaaaq-cai"
        )
        expect(proxyOptions.target).toBe("http://127.0.0.1:8080")
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key and /api goes to http://127.0.0.1:8080."
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
          canisters: { alpha: {}, beta: {} },
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
          canisters: { alpha: {}, beta: {} },
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
          canisters: {
            test_canister: { canisterId: "yq4ns-hyaaa-aaaap-akbna-cai" },
          },
        })
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        await request(middleware)

        expect(icpCalls()).toBe(calls)
      })
    })

    // Vite deep-merges what a plugin's config hook returns over the user's
    // config, so the /api entry the plugin returned replaced the user's own.
    // examples/codegen-in-action proxied /api to its own replica and got the
    // plugin's fallback. Here the user's replica is a dfx one on 4943, not the
    // fallback's 8000. These run Vite's real resolveConfig, which does that
    // merge.
    describe("with a Vite config that already proxies /api", () => {
      const userApiProxy = {
        target: "http://127.0.0.1:4943",
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
        ["in env-only mode", { canisters: {} }],
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
          target: "http://127.0.0.1:8000",
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
})
