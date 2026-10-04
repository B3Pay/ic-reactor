/**
 * Helpers for the plugin tests that run a real Vite server or build against a
 * temporary app.
 */
import fs from "node:fs"
import http from "node:http"
import Module, { createRequire } from "node:module"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  build,
  createLogger,
  createServer,
  version as viteVersion,
  type Logger,
  type Plugin,
  type ServerOptions,
  type ViteDevServer,
} from "vite"
import { icReactor, type IcReactorPluginOptions } from "../src/index.js"

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** The ICRC-1 ledger interface, the module every example generates. */
export const LEDGER_DID = path.join(HERE, "fixtures", "icrc1.did")

/** A `.did` the real generator cannot parse. */
export const BROKEN_DID = "service : { greet : (text) -> (text query\n"

/** A `.did` the generator accepts, for a canister that is not the point of a test. */
export const PING_DID = "service : { ping : () -> () };\n"

const FAKE_CLI = path.join(HERE, "fixtures", "fake-cli")

/**
 * The `server.watch` that starts no file watcher. Vite 5 and later take
 * `null`. Vite 4, the oldest major the peer range accepts and which
 * `verify:peer-floors` runs these tests on, has no such value and reads
 * `null` as the default watcher, whose events would double the ones the tests
 * emit: there the watcher ignores every path instead.
 */
const NO_WATCHER = (
  Number(viteVersion.split(".")[0]) < 5 ? { ignored: ["**"] } : null
) as ServerOptions["watch"]

export interface App {
  /** The app's root: a real path, since Vite compares real paths. */
  root: string
  /** What the stand-in CLI recorded: one entry per process it ran. */
  runs: () => string[][]
  cleanup: () => void
}

/**
 * A temporary app with `files` (relative path to text) and a CLI installed in
 * its `node_modules` the way an app installs it: the real `@candid-core/cli`
 * this package depends on (`"real"`), or a stand-in that crashes or hangs on a
 * `.did` that says TRAP or HANG (`"fake"`), or none (`"none"`).
 */
export function createApp(
  files: Record<string, string>,
  cli: "real" | "fake" | "none"
): App {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-vite-"))
  )
  const all: Record<string, string> = {
    "index.html":
      '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n',
    "main.js": 'console.log("app")\n',
    ...files,
  }
  for (const [file, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }

  const installed = path.join(root, "node_modules", "@candid-core", "cli")
  if (cli === "real") {
    const manifest = createRequire(import.meta.url).resolve(
      "@candid-core/cli/package.json"
    )
    fs.mkdirSync(path.dirname(installed), { recursive: true })
    fs.symlinkSync(path.dirname(manifest), installed, "junction")
  } else if (cli === "fake") {
    fs.mkdirSync(installed, { recursive: true })
    for (const file of ["package.json", "bin.js"]) {
      fs.copyFileSync(path.join(FAKE_CLI, file), path.join(installed, file))
    }
  }

  return {
    root,
    runs: () => {
      try {
        return fs
          .readFileSync(path.join(installed, "runs.log"), "utf-8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as string[])
      } catch {
        return []
      }
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

export interface RecordingLogger {
  logger: Logger
  /** Every line logged, as `"<level>: <message>"`, in order. */
  lines: string[]
}

/** A Vite logger that records what it is asked to log instead of printing it. */
export function recordingLogger(): RecordingLogger {
  const lines: string[] = []
  const logger = createLogger("info")
  const record = (level: string) => (message: string) => {
    lines.push(`${level}: ${message}`)
  }
  return {
    lines,
    logger: {
      ...logger,
      info: record("info"),
      warn: record("warn"),
      warnOnce: record("warn"),
      error: record("error"),
    },
  }
}

/**
 * Run `run` with `NODE_PATH` unset. Under `pnpm test`, pnpm sets it to its own
 * `node_modules`, where the real `@candid-core/cli` is installed, so an app
 * with no CLI of its own would find one all the same. Node reads `NODE_PATH`
 * once at startup, so it has to be read again after the change.
 */
export async function withoutNodePath<T>(run: () => Promise<T>): Promise<T> {
  const saved = process.env.NODE_PATH
  const initPaths = () =>
    (Module as unknown as { _initPaths(): void })._initPaths()
  delete process.env.NODE_PATH
  initPaths()
  try {
    return await run()
  } finally {
    if (saved !== undefined) process.env.NODE_PATH = saved
    initPaths()
  }
}

export interface Running {
  server: ViteDevServer
  port: number
  /** What the server's logger was asked to log. */
  lines: string[]
  close: () => Promise<void>
}

/**
 * `vite dev` over `root`, as its middlewares, on a free port.
 *
 * Its file watcher is off by default and the tests deliver the events they
 * mean to by emitting them: a real watcher on a directory created a moment
 * ago sometimes reports the files in it, which starts a run nobody asked for.
 * `realWatcher` keeps it. `hmr: false` is the server without a WebSocket. The
 * environment half of the plugin is off, so no test runs `icp`.
 */
export async function startDev(
  root: string,
  options: IcReactorPluginOptions,
  { before = [] as Plugin[], realWatcher = false, hmr = true } = {}
): Promise<Running> {
  const { logger, lines } = recordingLogger()
  const httpServer = http.createServer()
  const server = await createServer({
    root,
    configFile: false,
    customLogger: logger,
    server: {
      middlewareMode: true,
      hmr: hmr ? { server: httpServer } : false,
      watch: realWatcher ? undefined : NO_WATCHER,
    },
    plugins: [...before, icReactor({ injectEnvironment: false, ...options })],
  })
  httpServer.on("request", server.middlewares)
  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", () => resolve())
  )
  return {
    server,
    port: (httpServer.address() as AddressInfo).port,
    lines,
    close: async () => {
      await server.close()
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

/** `vite build` over `root`, writing nothing, and the lines it logged. */
export function runBuild(root: string, options: IcReactorPluginOptions) {
  const { logger, lines } = recordingLogger()
  const result = build({
    root,
    configFile: false,
    customLogger: logger,
    build: { write: false },
    plugins: [icReactor(options)],
  })
  return { result, lines }
}

/** A page request, as a browser makes it. */
export function get(port: number, pathname: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get(
        {
          host: "127.0.0.1",
          port,
          path: pathname,
          headers: { accept: "text/html" },
        },
        (res) => {
          let body = ""
          res.setEncoding("utf-8")
          res.on("data", (chunk: string) => (body += chunk))
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
        }
      )
      .on("error", reject)
  })
}
