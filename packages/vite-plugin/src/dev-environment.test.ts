/**
 * The `ic_env` cookie and the `/api` proxy of a real Vite server, with a fake
 * `icp` on the PATH whose answers change while the server runs.
 *
 * index.test.ts mocks `child_process`. This file checks what a browser gets
 * from `vite dev` and `vite preview` when the canisters are deployed, or the
 * network is started, after the server started.
 */
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import type { AddressInfo, Socket } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createLogger,
  createServer,
  preview,
  type Logger,
  type Plugin,
  type ViteDevServer,
} from "vite"
import { noWebSocket } from "../tests/support.js"
import { createLocalEnvironment } from "./dev-environment.js"
import { icReactor } from "./index.js"

const ROOT_KEY =
  "308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100aaae"
const BACKEND_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

/** What the fake `icp` reports. `network: null` is a network that is down. */
interface IcpState {
  network: { root_key: string; api_url: string } | null
  ids: Record<string, string>
  /** How long each command waits before it answers. */
  delayMs?: number
}

/**
 * A fake `icp`: it answers `network status` and `canister status -i` from
 * state.json beside it, and appends each command to calls.log.
 */
const FAKE_ICP = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const args = process.argv.slice(2)
fs.appendFileSync(path.join(__dirname, "calls.log"), args.join(" ") + "\\n")
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "state.json"), "utf-8"))
if (state.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, state.delayMs)
if (args[0] === "network" && args[1] === "status") {
  if (!state.network) {
    process.stderr.write("Error: the local network is not running\\n")
    process.exit(1)
  }
  process.stdout.write(JSON.stringify(state.network))
} else if (args[0] === "canister" && args[1] === "status") {
  // The canister: the argument after --, which ends the options.
  const name = args[args.indexOf("--") + 1]
  // Its own entries only: a canister named toString is one it does not know.
  const id = args.includes("--") && Object.prototype.hasOwnProperty.call(state.ids, name)
    ? state.ids[name]
    : undefined
  if (!id) {
    process.stderr.write("Error: canister " + name + " is not deployed\\n")
    process.exit(1)
  }
  process.stdout.write(id + "\\n")
} else {
  process.exit(2)
}
`

interface Response {
  status: number
  body: string
  /** The ic_env cookie's value, decoded, or undefined when none was set. */
  icEnv: string | undefined
  /** The response clears the ic_env cookie (`Max-Age=0`). */
  icEnvCleared: boolean
}

function get(
  port: number,
  pathname: string,
  accept = "text/html,application/xhtml+xml",
  hostHeader?: string
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        headers: {
          accept,
          ...(hostHeader === undefined ? {} : { host: hostHeader }),
        },
      },
      (res) => {
        let body = ""
        res.setEncoding("utf-8")
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => {
          const cookie = (res.headers["set-cookie"] ?? []).find((entry) =>
            entry.startsWith("ic_env=")
          )
          const cleared =
            cookie !== undefined && /;\s*Max-Age=0\b/i.test(cookie)
          resolve({
            status: res.statusCode ?? 0,
            body,
            icEnv:
              cookie && !cleared
                ? decodeURIComponent(
                    cookie.slice("ic_env=".length).split(";")[0]
                  )
                : undefined,
            icEnvCleared: cleared,
          })
        })
      }
    )
    req.on("error", reject)
  })
}

function listen(server: http.Server, port = 0): Promise<number> {
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port)
    )
  )
}

/**
 * Count the connections `server` accepts, and close them with it: `close`
 * stops listening and destroys every open connection, so the next one is
 * refused, as when a network stops.
 */
function track(server: http.Server) {
  const sockets = new Set<Socket>()
  let accepted = 0
  server.on("connection", (socket: Socket) => {
    accepted++
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })
  return {
    accepted: () => accepted,
    open: () => sockets.size,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      }),
  }
}

/** A silent logger that records its warnings. */
function recordWarnings() {
  const logger = createLogger("silent")
  const warnings: string[] = []
  logger.warn = (message) => void warnings.push(message)
  return { logger, warnings }
}

/** The warnings that say the network stopped. */
const stoppedWarnings = (warnings: string[]) =>
  warnings.filter((message) => message.includes("The local network at"))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(process.platform === "win32")(
  "the ic_env cookie and /api proxy of a running server",
  () => {
    let root = ""
    const closers: Array<() => Promise<unknown>> = []

    afterEach(async () => {
      for (const close of closers.splice(0).reverse()) await close()
      fs.rmSync(root, { recursive: true, force: true })
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })

    /** A project with one canister, a fake icp and a fake replica. */
    async function setUp(state: (replicaUrl: string) => IcpState) {
      vi.spyOn(console, "log").mockImplementation(() => {})
      vi.spyOn(console, "warn").mockImplementation(() => {})
      root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-dev-env-"))
      )
      fs.writeFileSync(
        path.join(root, "backend.did"),
        "service : { greet : () -> (text) query }\n"
      )
      fs.writeFileSync(
        path.join(root, "index.html"),
        "<!doctype html><html><body>app</body></html>\n"
      )

      const bin = path.join(root, "bin")
      fs.mkdirSync(bin)
      fs.writeFileSync(path.join(bin, "icp"), FAKE_ICP, { mode: 0o755 })
      vi.stubEnv("PATH", `${bin}${path.delimiter}${process.env.PATH ?? ""}`)

      const replica = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end(`replica:${req.url}`)
      })
      const connections = track(replica)
      const replicaUrl = `http://127.0.0.1:${await listen(replica)}`
      closers.push(async () => {
        if (replica.listening) await connections.close()
      })

      const setState = (next: IcpState) =>
        fs.writeFileSync(path.join(bin, "state.json"), JSON.stringify(next))
      setState(state(replicaUrl))

      /** Stop the fake replica, so a connection to it is refused. */
      const stopReplica = connections.close

      /** How many `icp` commands have run. */
      const icpCalls = () => {
        try {
          return fs
            .readFileSync(path.join(bin, "calls.log"), "utf-8")
            .trim()
            .split("\n").length
        } catch {
          return 0
        }
      }

      return { replicaUrl, setState, icpCalls, stopReplica, connections }
    }

    const plugin = () => icReactor({ canisters: { backend: {} } })

    /** The server the last `startDev` started. */
    let devServer: ViteDevServer | undefined

    /**
     * Start `vite dev` and serve its middlewares on a port. `laterPlugins` run
     * their config hooks after this plugin's.
     */
    async function startDev(
      laterPlugins: Plugin[] = [],
      customLogger?: Logger
    ): Promise<number> {
      const server = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        ...(customLogger === undefined ? {} : { customLogger }),
        server: { middlewareMode: true, ...noWebSocket() },
        plugins: [plugin(), ...laterPlugins],
      })
      devServer = server
      closers.push(() => server.close())
      const httpServer = http.createServer(server.middlewares)
      const port = await listen(httpServer)
      closers.push(() => new Promise((resolve) => httpServer.close(resolve)))
      return port
    }

    // `vite dev` usually starts before `icp deploy`. The cookie was fixed at
    // startup, so every reload after the deploy still lacked the id until the
    // dev server restarted (#664).
    it("gives a page load the id of a canister deployed after vite dev started", async () => {
      const { replicaUrl, setState, icpCalls } = await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: {},
      }))
      const port = await startDev()

      const before = await get(port, "/")
      expect(before.body).toContain("app")
      expect(before.icEnv).toContain(`ic_root_key=${ROOT_KEY}`)
      expect(before.icEnv).not.toContain("PUBLIC_CANISTER_ID:backend")

      setState({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      })

      expect((await get(port, "/")).icEnv).toContain(
        `PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`
      )

      // Every configured canister has an id now, so nothing runs icp again.
      const calls = icpCalls()
      for (let load = 0; load < 3; load++) {
        expect((await get(port, "/")).icEnv).toContain(
          `PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`
        )
      }
      expect((await get(port, "/api/v2/status", "*/*")).body).toBe(
        "replica:/api/v2/status"
      )
      expect(icpCalls()).toBe(calls)
    }, 30_000)

    // The network was down, so /api went to the fallback port and no cookie
    // was set, both for the lifetime of the server.
    it("follows a network that was down when vite dev started, and notices it stop", async () => {
      const { replicaUrl, setState, stopReplica } = await setUp(() => ({
        network: null,
        ids: {},
      }))
      const { logger, warnings } = recordWarnings()
      const port = await startDev([], logger)

      // No cookie to send, so the page load clears one an earlier server set.
      const first = await get(port, "/")
      expect(first.icEnv).toBeUndefined()
      expect(first.icEnvCleared).toBe(true)

      setState({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      })

      const page = await get(port, "/")
      expect(page.icEnv).toContain(`ic_root_key=${ROOT_KEY}`)
      expect(page.icEnv).toContain(`PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`)
      const api = await get(port, "/api/v2/status", "*/*")
      expect(api.status).toBe(200)
      expect(api.body).toBe("replica:/api/v2/status")

      // Watched from the detection that found it.
      await stopReplica()
      await vi.waitFor(
        () => expect(stoppedWarnings(warnings)).toHaveLength(1),
        { timeout: 5_000 }
      )
      expect((await get(port, "/")).icEnvCleared).toBe(true)
    }, 30_000)

    // A plugin whose config hook runs after this one can proxy /api too. Vite
    // merges its entry over the plugin's own and keeps the plugin's
    // `configure`, which then pointed /api back at the detected network.
    it("leaves /api where a later plugin points it", async () => {
      const { replicaUrl, setState } = await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: {},
      }))
      const backend = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end(`backend:${req.url}`)
      })
      const backendUrl = `http://127.0.0.1:${await listen(backend)}`
      closers.push(() => new Promise((resolve) => backend.close(resolve)))
      const port = await startDev([
        {
          name: "later-api-proxy",
          config: () => ({
            server: { proxy: { "/api": { target: backendUrl } } },
          }),
        },
      ])

      expect((await get(port, "/api/v2/status", "*/*")).body).toBe(
        "backend:/api/v2/status"
      )

      // A detection after startup does not move it either.
      setState({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      })
      expect((await get(port, "/")).icEnv).toContain(
        `PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`
      )
      expect((await get(port, "/api/v2/status", "*/*")).body).toBe(
        "backend:/api/v2/status"
      )
    }, 30_000)

    it("does not run icp for a module request while detection is incomplete", async () => {
      const { icpCalls } = await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: {},
      }))
      const port = await startDev()
      const calls = icpCalls()

      const module = await get(port, "/@vite/client", "*/*")

      expect(module.status).toBe(200)
      expect(module.icEnv).toContain(`ic_root_key=${ROOT_KEY}`)
      expect(icpCalls()).toBe(calls)
    }, 30_000)

    // After `icp network stop` the server kept sending the cookie, and after a
    // restart and `icp deploy` the same root key came back with the IDs handed
    // to other canisters: a page labelled one ledger wrote to another (#881).
    // Detection is not run again; the restart is the signal. The issue's steps
    // send no request to the network while it is down.
    it("clears the cookie, reloads open pages and says to restart once the network stops", async () => {
      const { replicaUrl, setState, icpCalls, stopReplica, connections } =
        await setUp((replicaUrl) => ({
          network: { root_key: ROOT_KEY, api_url: replicaUrl },
          ids: { backend: BACKEND_ID },
        }))
      const { logger, warnings } = recordWarnings()
      const port = await startDev([], logger)
      const reload = vi.spyOn(devServer!.ws, "send")

      const before = await get(port, "/")
      expect(before.icEnv).toContain(`PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`)
      expect(before.icEnvCleared).toBe(false)
      // The watch's connection: nothing else has reached the network.
      await vi.waitFor(() => expect(connections.open()).toBe(1))
      const calls = icpCalls()

      await stopReplica()
      await vi.waitFor(
        () => expect(stoppedWarnings(warnings)).toHaveLength(1),
        { timeout: 5_000 }
      )
      expect(stoppedWarnings(warnings)[0]).toContain(replicaUrl)
      expect(stoppedWarnings(warnings)[0]).toContain("restart this server")
      expect(reload).toHaveBeenCalledWith({ type: "full-reload" })

      // The network comes back under the same root key with the IDs swapped.
      setState({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: "aaaaa-aa" },
      })
      for (let load = 0; load < 2; load++) {
        const page = await get(port, "/")
        expect(page.body).toContain("app")
        expect(page.icEnv).toBeUndefined()
        expect(page.icEnvCleared).toBe(true)
      }
      // A module request neither sets nor clears it.
      const module = await get(port, "/@vite/client", "*/*")
      expect(module.icEnv).toBeUndefined()
      expect(module.icEnvCleared).toBe(false)

      // Reported once, and icp is not asked again.
      expect(stoppedWarnings(warnings)).toHaveLength(1)
      expect(reload).toHaveBeenCalledOnce()
      expect(icpCalls()).toBe(calls)
    }, 30_000)

    // A page load while a canister is still missing runs icp. A stop that
    // lands while it runs must not be undone when icp answers (#881).
    it("keeps a network lost while a detection was running", async () => {
      const { replicaUrl, setState, stopReplica, connections } = await setUp(
        (replicaUrl) => ({
          network: { root_key: ROOT_KEY, api_url: replicaUrl },
          ids: {},
        })
      )
      const environment = createLocalEnvironment({
        canisterNames: ["backend"],
        configuredCanisterIds: new Map(),
        projectRoot: root,
        onDiagnostic: () => {},
      })
      closers.push(async () => environment.close())
      const onLost = vi.fn()
      environment.watch(onLost)
      expect((await environment.detect()).environment).not.toBeNull()
      await vi.waitFor(() => expect(connections.open()).toBe(1))

      setState({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
        delayMs: 2_000,
      })
      let answered = false
      const running = environment.detect().then((state) => {
        answered = true
        return state
      })
      await stopReplica()
      await vi.waitFor(() => expect(onLost).toHaveBeenCalledOnce(), {
        timeout: 1_500,
      })
      // The stop landed before icp answered.
      expect(answered).toBe(false)

      const after = await running
      expect(after.lost).toBe(true)
      expect(after.cookie).toBeUndefined()
      expect(environment.state?.lost).toBe(true)
      expect(onLost).toHaveBeenCalledOnce()
    }, 30_000)

    // `icp network status` can report a network whose gateway does not take
    // connections yet. Refused then, it is starting, not stopped.
    it("does not lose a network that is still starting", async () => {
      const gateway = http.createServer((_req, res) => res.end())
      const gatewayConnections = track(gateway)
      const gatewayPort = await listen(gateway)
      await gatewayConnections.close()
      const gatewayUrl = `http://127.0.0.1:${gatewayPort}`
      await setUp(() => ({
        network: { root_key: ROOT_KEY, api_url: gatewayUrl },
        ids: { backend: BACKEND_ID },
      }))
      const environment = createLocalEnvironment({
        canisterNames: ["backend"],
        configuredCanisterIds: new Map(),
        projectRoot: root,
        onDiagnostic: () => {},
      })
      closers.push(async () => environment.close())
      const onLost = vi.fn()
      environment.watch(onLost)
      expect((await environment.detect()).complete).toBe(true)

      // Refused, and tried again, more than once.
      await sleep(2_500)
      expect(onLost).not.toHaveBeenCalled()
      expect(environment.state?.lost).toBe(false)

      // Up, then stopped.
      await listen(gateway, gatewayPort)
      closers.push(async () => {
        if (gateway.listening) await gatewayConnections.close()
      })
      await vi.waitFor(() => expect(gatewayConnections.open()).toBe(1), {
        timeout: 5_000,
      })
      await gatewayConnections.close()
      await vi.waitFor(() => expect(onLost).toHaveBeenCalledOnce(), {
        timeout: 5_000,
      })
      expect(environment.state?.lost).toBe(true)
    }, 30_000)

    // A gateway can close a connection that sends nothing, and keep running.
    it("does not lose a network that closes idle connections", async () => {
      const gateway = http.createServer((_req, res) => res.end())
      gateway.on("connection", (socket: Socket) => {
        setTimeout(() => socket.destroy(), 100)
      })
      const gatewayConnections = track(gateway)
      const gatewayUrl = `http://127.0.0.1:${await listen(gateway)}`
      closers.push(async () => {
        if (gateway.listening) await gatewayConnections.close()
      })
      await setUp(() => ({
        network: { root_key: ROOT_KEY, api_url: gatewayUrl },
        ids: { backend: BACKEND_ID },
      }))
      const environment = createLocalEnvironment({
        canisterNames: ["backend"],
        configuredCanisterIds: new Map(),
        projectRoot: root,
        onDiagnostic: () => {},
      })
      closers.push(async () => environment.close())
      const onLost = vi.fn()
      environment.watch(onLost)
      await environment.detect()

      // Closed, and connected again, more than once.
      await vi.waitFor(
        () => expect(gatewayConnections.accepted()).toBeGreaterThan(2),
        { timeout: 5_000 }
      )
      expect(onLost).not.toHaveBeenCalled()
      expect(environment.state?.lost).toBe(false)
    }, 30_000)

    // A restart closes the old server after starting the new one, so an old
    // watch left running would report the new server's network stopping.
    it("stops watching when the dev server closes", async () => {
      const { connections } = await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      }))
      await startDev()
      await vi.waitFor(() => expect(connections.open()).toBe(1))

      await devServer!.close()

      await vi.waitFor(() => expect(connections.open()).toBe(0))
      await sleep(500)
      expect(connections.open()).toBe(0)
    }, 30_000)

    // `vite --host` serves the cookie and /api to a phone on the LAN, where
    // core does not believe the cookie, so `"env"` there needs saying (#902).
    it("warns once when a page is loaded by a host that is not loopback", async () => {
      await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      }))
      const { logger, warnings } = recordWarnings()
      const port = await startDev([], logger)
      const notEnv = () =>
        warnings.filter((message) => message.includes("not localhost"))

      for (const host of [
        `127.0.0.1:${port}`,
        `localhost:${port}`,
        `app.localhost:${port}`,
        `[::1]:${port}`,
      ]) {
        expect((await get(port, "/", undefined, host)).status).toBe(200)
      }
      // A module request from the LAN is not a page load.
      await get(port, "/index.html", "*/*", `192.168.1.5:${port}`)
      expect(notEnv()).toEqual([])

      const lan = await get(port, "/", undefined, `192.168.1.5:${port}`)
      expect(lan.icEnv).toContain(`PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`)
      await get(port, "/", undefined, `192.168.1.5:${port}`)
      await get(port, "/", undefined, `10.0.0.2:${port}`)

      expect(notEnv()).toHaveLength(1)
      expect(notEnv()[0]).toContain(`192.168.1.5:${port}`)
      expect(notEnv()[0]).toContain('network: "env" is for localhost pages')
    }, 30_000)

    // `vite preview` resolves the config with the `serve` command, and used to
    // get the cookie through `preview.headers`, which defaults to
    // `server.headers`.
    it("sets the cookie and proxies /api on vite preview, and clears it once the network stops", async () => {
      const { replicaUrl, stopReplica } = await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      }))
      const { logger, warnings } = recordWarnings()
      fs.mkdirSync(path.join(root, "dist"))
      fs.copyFileSync(
        path.join(root, "index.html"),
        path.join(root, "dist/index.html")
      )

      const server = await preview({
        root,
        configFile: false,
        logLevel: "silent",
        customLogger: logger,
        preview: { port: 0, host: "127.0.0.1" },
        plugins: [plugin()],
      })
      closers.push(
        () =>
          new Promise((resolve) =>
            server.httpServer.close(() => resolve(undefined))
          )
      )
      const { port } = server.httpServer.address() as AddressInfo

      expect((await get(port, "/")).icEnv).toContain(
        `PUBLIC_CANISTER_ID:backend=${BACKEND_ID}`
      )
      expect((await get(port, "/api/v2/status", "*/*")).body).toBe(
        "replica:/api/v2/status"
      )

      await stopReplica()
      await vi.waitFor(
        () => expect(stoppedWarnings(warnings)).toHaveLength(1),
        { timeout: 5_000 }
      )
      expect(stoppedWarnings(warnings)[0]).toContain(replicaUrl)
      const page = await get(port, "/")
      expect(page.icEnv).toBeUndefined()
      expect(page.icEnvCleared).toBe(true)
    }, 30_000)
  }
)
