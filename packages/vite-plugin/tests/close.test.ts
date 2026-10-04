/**
 * A generator that is running when the dev server closes is killed with it:
 * it would otherwise keep Node alive for the rest of its timeout, and a
 * restarted server would run beside it on the same outDir.
 */
import fs from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Plugin } from "vite"
import { icReactor } from "../src/index.js"
import { createApp, recordingLogger, startDev, type App } from "./support.js"

let app: App | undefined

afterEach(() => {
  app?.cleanup()
  app = undefined
})

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** The pids the stand-in CLI hung in, once there is one. */
const hungPids = (root: string): number[] => {
  try {
    return fs
      .readFileSync(
        path.join(root, "node_modules/@candid-core/cli/hang.pids"),
        "utf-8"
      )
      .trim()
      .split("\n")
      .map(Number)
  } catch {
    return []
  }
}

describe("a generator that is running when the dev server closes", () => {
  it("is killed with the server, and nothing is reported for it", async () => {
    app = createApp({ "did/a.did": "ok\n" }, "fake")
    const running = await startDev(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })
    const a = path.join(app.root, "did/a.did")

    // A save starts a run that hangs, and another save queues behind it.
    fs.writeFileSync(a, "HANG\n")
    running.server.watcher.emit("change", a)
    await vi.waitFor(() => expect(hungPids(app!.root)).toHaveLength(1))
    running.server.watcher.emit("change", a)
    const [pid] = hungPids(app.root)
    const send = vi.spyOn(running.server.ws, "send")
    const lines = running.lines.length

    try {
      await running.close()

      // Not at the 60 s timeout: now.
      await vi.waitFor(() => expect(alive(pid)).toBe(false), { timeout: 3000 })
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(running.lines.slice(lines)).toEqual([])
      expect(send).not.toHaveBeenCalled()
      // The queued save did not start a generator of its own: the run at
      // startup, and the one that hung.
      expect(app.runs()).toHaveLength(2)
    } finally {
      if (alive(pid)) process.kill(pid, "SIGKILL")
    }
  })

  it("leaves a server that starts again on the same app free to generate", async () => {
    app = createApp({ "did/a.did": "ok\n" }, "fake")
    const first = await startDev(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })
    const a = path.join(app.root, "did/a.did")
    fs.writeFileSync(a, "HANG\n")
    first.server.watcher.emit("change", a)
    await vi.waitFor(() => expect(hungPids(app!.root)).toHaveLength(1))
    const [pid] = hungPids(app.root)
    try {
      await first.close()
      // Dead before the new server starts, so the two never share an outDir.
      await vi.waitFor(() => expect(alive(pid)).toBe(false), { timeout: 3000 })
    } finally {
      if (alive(pid)) process.kill(pid, "SIGKILL")
    }

    fs.writeFileSync(a, "ok again\n")
    const second = await startDev(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })
    try {
      expect(second.lines).toContain(
        "info: ic-reactor: generated a into src/canisters/a.ts"
      )
      expect(second.lines.filter((line) => line.startsWith("error:"))).toEqual(
        []
      )
    } finally {
      await second.close()
    }
  })

  // The same plugin object serves a server that is started again, as it does
  // when Vite restarts a server whose config is not a file.
  it("does not stop a plugin that is run again after it was closed", async () => {
    app = createApp({ "did/a.did": "ok\n" }, "fake")
    const plugin = icReactor({
      canisters: { a: { didFile: "did/a.did" } },
    }) as Omit<Plugin, "configResolved" | "buildStart" | "closeBundle"> & {
      configResolved: (config: unknown) => void
      buildStart: (this: unknown) => Promise<void>
      closeBundle: () => void
    }
    const { logger, lines } = recordingLogger()
    plugin.configResolved({ root: app.root, command: "build", logger })
    const context = { addWatchFile: vi.fn(), error: vi.fn() }

    plugin.closeBundle()
    await plugin.buildStart.call(context)

    expect(context.error).not.toHaveBeenCalled()
    expect(lines).toContain(
      "info: ic-reactor: generated a into src/canisters/a.ts"
    )
  })
})
