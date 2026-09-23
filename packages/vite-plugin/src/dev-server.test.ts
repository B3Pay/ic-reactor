/**
 * `vite dev` with the plugin, the real codegen pipeline and a real filesystem
 * watcher.
 *
 * index.test.ts hands the plugin watcher events directly. This file checks the
 * plugin against the events a real Vite dev server delivers, and against the
 * settings that decide which hooks Vite calls.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createServer, type ViteDevServer } from "vite"
import { icReactor } from "./index.js"

const service = (method: string) =>
  `service : {\n  ${method} : () -> (text) query;\n}\n`

describe("vite dev", () => {
  let root = ""
  let server: ViteDevServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    fs.rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function start(hmr: boolean, initialDid?: string) {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-dev-server-"))
    )
    fs.mkdirSync(path.join(root, "candid"))
    if (initialDid !== undefined) {
      fs.writeFileSync(path.join(root, "candid", "backend.did"), initialDid)
    }
    server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      // Middleware mode starts the plugins without opening a port.
      server: { middlewareMode: true, hmr },
      plugins: [
        icReactor({
          canisters: [{ name: "backend", didFile: "candid/backend.did" }],
          injectEnvironment: false,
          target: "core",
        }),
      ],
    })
    return path.join(root, "candid", "backend.did")
  }

  /** Save `content` until the generated declarations carry `method`. */
  async function saveUntilGenerated(
    didFile: string,
    content: string,
    method: string
  ): Promise<boolean> {
    const generated = path.join(
      root,
      "src/declarations/backend/declarations/backend.js"
    )
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline) {
      // Saved again each round, in case the watcher was not ready yet.
      fs.writeFileSync(didFile, content)
      await new Promise((resolve) => setTimeout(resolve, 400))
      if (
        fs.existsSync(generated) &&
        fs.readFileSync(generated, "utf-8").includes(method)
      ) {
        return true
      }
    }
    return false
  }

  // With HMR off, Vite never calls `handleHotUpdate`, which is where saves
  // used to be handled, so no save ever regenerated.
  it("regenerates a saved .did with server.hmr set to false", async () => {
    const didFile = await start(false, service("first"))
    expect(
      fs.readFileSync(
        path.join(root, "src/declarations/backend/declarations/backend.js"),
        "utf-8"
      )
    ).toContain("first")

    expect(await saveUntilGenerated(didFile, service("second"), "second")).toBe(
      true
    )
  }, 30_000)

  it("generates a .did that is created after the server started", async () => {
    const didFile = await start(true)
    expect(fs.existsSync(didFile)).toBe(false)
    expect(await saveUntilGenerated(didFile, service("later"), "later")).toBe(
      true
    )
  }, 30_000)
})
