/**
 * The local IC environment is the `icp` CLI's business, and a test run has
 * none: in mode `test` (Vitest's) the plugin never runs `icp`, and under
 * `vite dev` it does.
 */
import { spawn } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { icReactor } from "../src/index.js"
import {
  createApp,
  get,
  icpProcess,
  noWebSocket,
  startDev,
  type App,
} from "./support.js"

// `env.ts` runs `icp` through `spawn`; nothing here needs it to exist.
vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  spawn: vi.fn(),
}))

const closers: Array<() => Promise<unknown>> = []
let app: App | undefined

beforeEach(() => {
  vi.mocked(spawn).mockReset()
  // `icp` answers with a failure, as it does with no local network.
  vi.mocked(spawn).mockImplementation((() =>
    icpProcess(new Error("no local network"))) as never)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
  app?.cleanup()
  app = undefined
  vi.restoreAllMocks()
})

const icpCommands = () =>
  vi.mocked(spawn).mock.calls.map(([file, args]) => [file, ...(args ?? [])])

describe("mode test", () => {
  it("never runs icp, injects nothing and adds no middleware", async () => {
    const plugin = icReactor({ canisters: { backend: {} } }) as unknown as {
      config: (
        config: object,
        env: { command: string; mode: string }
      ) => Promise<object>
      configureServer: (server: unknown) => void
    }

    const config = await plugin.config({}, { command: "serve", mode: "test" })
    const use = vi.fn()
    plugin.configureServer({ middlewares: { use } })

    expect(config).toEqual({})
    expect(use).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })

  it("never runs icp for a real Vite server in mode test", async () => {
    app = createApp({}, "none")
    const { createServer } = await import("vite")
    const server = await createServer({
      root: app.root,
      configFile: false,
      mode: "test",
      logLevel: "silent",
      server: { middlewareMode: true, ...noWebSocket() },
      plugins: [icReactor({ canisters: { backend: {} } })],
    })
    closers.push(() => server.close())

    expect(spawn).not.toHaveBeenCalled()
    expect(server.config.server.proxy?.["/api"]).toBeUndefined()
  })
})

describe("vite dev", () => {
  it("runs icp, in the same server that mode test leaves alone", async () => {
    app = createApp({}, "none")
    const { createServer } = await import("vite")
    const server = await createServer({
      root: app.root,
      configFile: false,
      mode: "development",
      logLevel: "silent",
      server: { middlewareMode: true, ...noWebSocket() },
      plugins: [icReactor({ canisters: { backend: {} } })],
    })
    closers.push(() => server.close())

    expect(icpCommands()[0]).toEqual([
      "icp",
      "network",
      "status",
      "-e",
      "local",
      "--json",
    ])
    expect(server.config.server.proxy?.["/api"]).toBeDefined()
  })

  it("serves pages without the environment half when injectEnvironment is off", async () => {
    app = createApp({}, "none")
    const running = await startDev(app.root, {
      canisters: { backend: {} },
      injectEnvironment: false,
    })
    closers.push(running.close)

    expect((await get(running.port, "/")).status).toBe(200)
    expect(spawn).not.toHaveBeenCalled()
  })
})

describe("vite build", () => {
  it("never runs icp", async () => {
    app = createApp({}, "none")
    const plugin = icReactor({ canisters: { backend: {} } }) as unknown as {
      config: (
        config: object,
        env: { command: string; mode: string }
      ) => Promise<object>
    }

    expect(
      await plugin.config({}, { command: "build", mode: "production" })
    ).toEqual({})
    expect(spawn).not.toHaveBeenCalled()
  })
})
