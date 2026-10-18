/**
 * `onGenerated`: called once for each module a run generated, inside the
 * run, under a real `vite build` and a real `vite dev` server, with the real
 * `@candid-core/cli`. A throw fails the module's canisters as a failed
 * generation does, and they are generated, and the hook called, again on the
 * next run.
 */
import fs from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Plugin } from "vite"
import { icReactor, type IcReactorPluginOptions } from "../src/index.js"
import {
  BROKEN_DID,
  createApp,
  PING_DID,
  recordingLogger,
  runBuild,
  startDev,
  type App,
  type Running,
} from "./support.js"

type Hook = NonNullable<IcReactorPluginOptions["onGenerated"]>
type Call = Parameters<Hook>[0]

const closers: Array<() => Promise<unknown>> = []
const apps: App[] = []

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
  for (const app of apps.splice(0)) app.cleanup()
})

function newApp(files: Record<string, string>) {
  const app = createApp(files, "real")
  apps.push(app)
  return app
}

async function serve(
  root: string,
  options: IcReactorPluginOptions
): Promise<Running> {
  const running = await startDev(root, options)
  closers.push(running.close)
  return running
}

/** A hook that records what it is called with, and the envelope it read. */
function recordingHook(behave: (call: Call) => unknown = () => undefined) {
  const calls: Array<Omit<Call, "signal"> & { envelopeText: string }> = []
  const hook: Hook = async (call) => {
    const { signal: _signal, ...rest } = call
    calls.push({
      ...rest,
      envelopeText: fs.readFileSync(call.envelope, "utf-8"),
    })
    await behave(call)
  }
  return { calls, hook }
}

/** The plugin, driven by hand as a build drives it. */
function buildPlugin(app: App, options: IcReactorPluginOptions) {
  const plugin = icReactor(options) as Plugin & {
    configResolved: (config: unknown) => void
    buildStart: (this: unknown) => Promise<void>
    closeBundle: (this: unknown) => void
  }
  const { logger, lines } = recordingLogger()
  plugin.configResolved({ root: app.root, command: "build", logger })
  const context = {
    addWatchFile: vi.fn(),
    error: vi.fn((message: unknown) => {
      throw new Error(String(message))
    }),
  }
  return {
    lines,
    buildStart: () => plugin.buildStart.call(context),
    closeBundle: () => plugin.closeBundle.call({}),
  }
}

describe("onGenerated under vite build", () => {
  it("is called once for each module, after the generator wrote it and its envelope, and not for a canister that failed", async () => {
    const app = newApp({
      "did/ping.did": PING_DID,
      "did/shared.did": "service : { pong : () -> () };\n",
      "did/bad.did": BROKEN_DID,
    })
    const { calls, hook } = recordingHook()
    const { result } = runBuild(app.root, {
      failOnError: false,
      onGenerated: hook,
      canisters: {
        ping: { didFile: "did/ping.did" },
        left: { didFile: "did/shared.did" },
        right: { didFile: "did/shared.did" },
        bad: { didFile: "did/bad.did" },
      },
    })
    await result

    const out = path.join(app.root, "src/canisters")
    expect(
      calls
        .map(({ envelopeText: _, ...call }) => call)
        .sort((a, b) => a.module.localeCompare(b.module))
    ).toEqual([
      {
        names: ["ping"],
        didFile: path.join(app.root, "did/ping.did"),
        module: path.join(out, "ping.ts"),
        envelope: path.join(out, "ping.envelope.json"),
        status: "written",
      },
      {
        names: ["left", "right"],
        didFile: path.join(app.root, "did/shared.did"),
        module: path.join(out, "shared.ts"),
        envelope: path.join(out, "shared.envelope.json"),
        status: "written",
      },
    ])
    // Each read its own envelope, already on disk.
    for (const call of calls) {
      expect(call.envelopeText).toBe(fs.readFileSync(call.envelope, "utf-8"))
      expect(call.envelopeText.length).toBeGreaterThan(0)
    }
  })

  it("fails the build with a hook that rejects, naming the canister and the hook", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    const { result } = runBuild(app.root, {
      onGenerated: () => Promise.reject(new Error("ids differ")),
      canisters: { ping: { didFile: "did/ping.did" } },
    })

    await expect(result).rejects.toThrow(
      /could not generate 1 of 1 canisters:\n {2}- ping \(did\/ping\.did\): onGenerated failed for src\/canisters\/ping\.ts: .*ids differ/s
    )
  })

  it("only logs a hook's failure when failOnError is off", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      onGenerated: () => {
        throw new Error("ids differ")
      },
      canisters: { ping: { didFile: "did/ping.did" } },
    })

    await result
    expect(lines.filter((line) => line.startsWith("error:"))).toEqual([
      expect.stringContaining("onGenerated failed for src/canisters/ping.ts"),
    ])
  })

  it("is waited for by buildStart, which the next run waits for in turn", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const { calls, hook } = recordingHook(() => held)
    const { buildStart } = buildPlugin(app, {
      onGenerated: hook,
      canisters: { ping: { didFile: "did/ping.did" } },
    })

    const done: string[] = []
    const first = buildStart().then(() => done.push("first"))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    // A second run is queued behind the first, hook included.
    const second = buildStart().then(() => done.push("second"))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(done).toEqual([])

    release()
    await Promise.all([first, second])
    expect(done).toEqual(["first", "second"])
  })

  it("is abandoned when the build closes, so a hook that never settles holds nothing, and the next run calls it again", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    let hold = true
    const { calls, hook } = recordingHook(() => {
      // Ignores its signal, and never settles.
      if (hold) return new Promise<void>(() => {})
    })
    const { buildStart, closeBundle, lines } = buildPlugin(app, {
      onGenerated: hook,
      canisters: { ping: { didFile: "did/ping.did" } },
    })

    const first = buildStart()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    closeBundle()
    await first
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(lines.filter((line) => line.startsWith("error:"))).toEqual([])

    // The .did is unchanged, but the hook never finished: generated again.
    hold = false
    await buildStart()
    expect(calls).toHaveLength(2)
  })

  it("is called again on the next run after it failed, and not after it succeeded", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    let fail = true
    const { calls, hook } = recordingHook(() => {
      if (fail) throw new Error("not yet")
    })
    const { buildStart, lines } = buildPlugin(app, {
      failOnError: false,
      onGenerated: hook,
      canisters: { ping: { didFile: "did/ping.did" } },
    })

    await buildStart()
    expect(calls).toHaveLength(1)
    expect(lines).toContainEqual(expect.stringContaining("not yet"))

    // The .did is unchanged, but the failed module is generated again.
    fail = false
    await buildStart()
    expect(calls).toHaveLength(2)

    // Once it succeeded, an unchanged .did is not generated, and the hook is
    // not called.
    await buildStart()
    expect(calls).toHaveLength(2)
  })
})

describe("onGenerated under vite dev", () => {
  it("is called at startup and again after a save, seeing the new envelope", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    const { calls, hook } = recordingHook()
    const { server } = await serve(app.root, {
      onGenerated: hook,
      canisters: { ping: { didFile: "did/ping.did" } },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].envelopeText).not.toContain("more")

    const did = path.join(app.root, "did/ping.did")
    fs.writeFileSync(did, "service : { ping : () -> (); more : () -> () };\n")
    server.watcher.emit("change", did)

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].envelopeText).toContain("more")
  })

  it("reports a hook that rejects as a failed generation, and calls it again on the next save", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    let fail = true
    const { calls, hook } = recordingHook(() => {
      if (fail) return Promise.reject(new Error("ids differ"))
    })
    const { server, lines } = await serve(app.root, {
      onGenerated: hook,
      canisters: { ping: { didFile: "did/ping.did" } },
    })
    const send = vi.spyOn(server.ws, "send")
    const errors = () => lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toEqual([
      expect.stringContaining(
        "ping (did/ping.did): onGenerated failed for src/canisters/ping.ts"
      ),
    ])

    // The same text saved again: the failed module is generated again.
    fail = false
    const did = path.join(app.root, "did/ping.did")
    fs.writeFileSync(did, PING_DID)
    server.watcher.emit("change", did)

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    // The overlay is cleared once it succeeds.
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith({ type: "full-reload" })
    )
    expect(errors()).toHaveLength(1)
  })

  it("is handed a signal that the server's close aborts, and a hook still running then reports nothing", async () => {
    const app = newApp({ "did/ping.did": PING_DID })
    let seen: AbortSignal | undefined
    let saves = 0
    const { calls, hook } = recordingHook((call) => {
      // Startup's call returns at once; the save's rejects once the server
      // closed.
      if (saves === 0) return
      seen = call.signal
      return new Promise<void>((_resolve, reject) =>
        call.signal.addEventListener("abort", () => reject(new Error("closed")))
      )
    })
    const { server, lines, close } = await serve(app.root, {
      onGenerated: hook,
      canisters: { ping: { didFile: "did/ping.did" } },
    })

    saves = 1
    const did = path.join(app.root, "did/ping.did")
    fs.writeFileSync(did, "service : { ping : () -> (); more : () -> () };\n")
    server.watcher.emit("change", did)
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(seen?.aborted).toBe(false)

    const before = lines.length
    await close()
    closers.splice(0)
    expect(seen?.aborted).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(
      lines.slice(before).filter((line) => line.startsWith("error:"))
    ).toEqual([])
  })
})
