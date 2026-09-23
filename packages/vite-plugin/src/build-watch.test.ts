/**
 * `vite build --watch` with the plugin, the real codegen pipeline and a real
 * filesystem.
 *
 * Unlike the dev server, a watch build calls `buildStart` again for every
 * rebuild, and it only rebuilds for files it watches. Both matter here: a
 * `.did` file is not part of the module graph, and the generated files are.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { build } from "vite"
import { icReactor } from "./index.js"

const service = (method: string) =>
  `service : {\n  ${method} : () -> (text) query;\n}\n`

interface Watcher {
  on(event: "event", listener: (event: WatchEvent) => void): void
  close(): Promise<void>
}

interface WatchEvent {
  code: string
  error?: Error
  result?: { close?: () => Promise<void> | void }
}

describe("vite build --watch", () => {
  let root = ""
  let watcher: Watcher | undefined

  afterEach(async () => {
    await watcher?.close()
    watcher = undefined
    fs.rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it("rebuilds with new bindings when a .did is saved, and settles after a source edit", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-build-watch-"))
    )
    fs.mkdirSync(path.join(root, "src"))
    fs.writeFileSync(
      path.join(root, "index.html"),
      `<!doctype html><script type="module" src="/src/main.ts"></script>\n`
    )
    fs.writeFileSync(
      path.join(root, "src", "clients.ts"),
      "export const clientManager = {} as never\n"
    )
    const main = path.join(root, "src", "main.ts")
    fs.writeFileSync(
      main,
      `import { backendReactor } from "./declarations/backend"\nconsole.log(backendReactor)\n`
    )
    const didFile = path.join(root, "backend.did")
    fs.writeFileSync(didFile, service("greet"))

    let builds = 0
    let failure: Error | undefined
    const listeners = new Set<() => void>()
    const nextBuild = (timeoutMs: number) =>
      new Promise<boolean>((resolve) => {
        const done = (value: boolean) => {
          listeners.delete(onBuild)
          clearTimeout(timer)
          resolve(value)
        }
        const onBuild = () => done(true)
        const timer = setTimeout(() => done(false), timeoutMs)
        listeners.add(onBuild)
      })
    /** Wait until no build has finished for `quietMs`, up to `limit` builds. */
    const settle = async (quietMs: number, limit = 20) => {
      for (let count = 0; count < limit; count++) {
        if (!(await nextBuild(quietMs))) return
      }
    }

    const firstBuild = nextBuild(30_000)
    watcher = (await build({
      root,
      configFile: false,
      logLevel: "silent",
      build: {
        watch: {},
        minify: false,
        rollupOptions: { external: [/^@ic-reactor\//] },
      },
      plugins: [
        icReactor({
          canisters: [{ name: "backend", didFile: "backend.did" }],
          target: "core",
        }),
      ],
    })) as unknown as Watcher
    watcher.on("event", (event) => {
      if (event.code === "BUNDLE_END") void event.result?.close?.()
      if (event.code === "ERROR") failure = event.error
      if (event.code === "END") {
        builds += 1
        for (const listener of [...listeners]) listener()
      }
    })

    expect(await firstBuild).toBe(true)
    // A rebuild that the first build's own output starts may still be on its
    // way. Let it finish.
    await settle(1_000)

    const bundle = () => {
      const assets = path.join(root, "dist", "assets")
      return fs
        .readdirSync(assets)
        .map((file) => fs.readFileSync(path.join(assets, file), "utf-8"))
        .join("\n")
    }

    // A saved .did reaches the bundle. The .did is not in the module graph, so
    // without the plugin registering it nothing rebuilt.
    fs.writeFileSync(didFile, service("greet_v2"))
    const deadline = Date.now() + 15_000
    while (!bundle().includes("greet_v2") && Date.now() < deadline) {
      await nextBuild(deadline - Date.now())
    }
    expect(bundle()).toContain("greet_v2")
    await settle(1_000)

    // An edit to a source file rebuilds once and stops. Each rebuild used to
    // regenerate the bindings, the watcher saw those files change and started
    // another rebuild, and that never ended.
    const before = builds
    fs.writeFileSync(
      main,
      `import { backendReactor } from "./declarations/backend"\nconsole.log("edited", backendReactor)\n`
    )
    expect(await nextBuild(15_000)).toBe(true)
    await settle(1_500)
    expect(builds - before).toBeLessThanOrEqual(2)
    expect(failure).toBeUndefined()
  }, 60_000)
})
