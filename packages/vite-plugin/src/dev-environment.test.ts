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
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createServer, preview, type Plugin } from "vite"
import { icReactor } from "./index.js"

const ROOT_KEY =
  "308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100aaae"
const BACKEND_ID = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

/** What the fake `icp` reports. `network: null` is a network that is down. */
interface IcpState {
  network: { root_key: string; api_url: string } | null
  ids: Record<string, string>
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
if (args[0] === "network" && args[1] === "status") {
  if (!state.network) {
    process.stderr.write("Error: the local network is not running\\n")
    process.exit(1)
  }
  process.stdout.write(JSON.stringify(state.network))
} else if (args[0] === "canister" && args[1] === "status") {
  const id = state.ids[args[2]]
  if (!id) {
    process.stderr.write("Error: canister " + args[2] + " is not deployed\\n")
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
}

function get(
  port: number,
  pathname: string,
  accept = "text/html,application/xhtml+xml"
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: pathname, headers: { accept } },
      (res) => {
        let body = ""
        res.setEncoding("utf-8")
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => {
          const cookie = (res.headers["set-cookie"] ?? []).find((entry) =>
            entry.startsWith("ic_env=")
          )
          resolve({
            status: res.statusCode ?? 0,
            body,
            icEnv: cookie
              ? decodeURIComponent(cookie.slice("ic_env=".length).split(";")[0])
              : undefined,
          })
        })
      }
    )
    req.on("error", reject)
  })
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port)
    )
  )
}

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
      const replicaUrl = `http://127.0.0.1:${await listen(replica)}`
      closers.push(() => new Promise((resolve) => replica.close(resolve)))

      const setState = (next: IcpState) =>
        fs.writeFileSync(path.join(bin, "state.json"), JSON.stringify(next))
      setState(state(replicaUrl))

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

      return { replicaUrl, setState, icpCalls }
    }

    const plugin = () =>
      icReactor({
        canisters: [{ name: "backend", didFile: "backend.did" }],
        target: "core",
      })

    /**
     * Start `vite dev` and serve its middlewares on a port. `laterPlugins` run
     * their config hooks after this plugin's.
     */
    async function startDev(laterPlugins: Plugin[] = []): Promise<number> {
      const server = await createServer({
        root,
        configFile: false,
        logLevel: "silent",
        server: { middlewareMode: true, hmr: false },
        plugins: [plugin(), ...laterPlugins],
      })
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
    it("follows a network that was down when vite dev started", async () => {
      const { replicaUrl, setState } = await setUp(() => ({
        network: null,
        ids: {},
      }))
      const port = await startDev()

      expect((await get(port, "/")).icEnv).toBeUndefined()

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

    // `vite preview` resolves the config with the `serve` command, and used to
    // get the cookie through `preview.headers`, which defaults to
    // `server.headers`.
    it("sets the cookie and proxies /api on vite preview", async () => {
      await setUp((replicaUrl) => ({
        network: { root_key: ROOT_KEY, api_url: replicaUrl },
        ids: { backend: BACKEND_ID },
      }))
      fs.mkdirSync(path.join(root, "dist"))
      fs.copyFileSync(
        path.join(root, "index.html"),
        path.join(root, "dist/index.html")
      )

      const server = await preview({
        root,
        configFile: false,
        logLevel: "silent",
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
    }, 30_000)
  }
)
