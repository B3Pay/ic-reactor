/**
 * Generation: the plugin runs `candid-core-cli gen` in a child process under
 * a real `vite dev` server and a real `vite build`, and a failure of the
 * generator stops that process and not the run.
 *
 * Most tests install the real `@candid-core/cli` into a temporary app. The
 * ones about a generator that crashes install a stand-in
 * (tests/fixtures/fake-cli), since the real one has no input that crashes it.
 */
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Plugin } from "vite"
import { icReactor, type IcReactorPluginOptions } from "../src/index.js"
import {
  BROKEN_DID,
  createApp,
  get,
  LEDGER_DID,
  PING_DID,
  recordingLogger,
  runBuild as buildApp,
  startDev,
  withoutNodePath,
  type App,
  type Running,
} from "./support.js"

// The real `spawn`, watched: the tests count the generator processes the
// plugin starts and read their arguments.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>()
  return { ...actual, spawn: vi.fn(actual.spawn) }
})

const GUIDE =
  "ic-reactor: agent guide at node_modules/@ic-reactor/core/llms.txt"
const LEDGER = fs.readFileSync(LEDGER_DID, "utf-8")

/** The `.did` files of each generator process the plugin has started. */
const generatorRuns = (): string[][] =>
  vi
    .mocked(spawn)
    .mock.calls.map(([, args]) => (args ?? []) as string[])
    .filter((args) => args[1] === "gen")
    .map((args) => args.slice(2, args.indexOf("-o")))

const closers: Array<() => Promise<unknown>> = []
const apps: App[] = []

beforeEach(() => {
  vi.mocked(spawn).mockClear()
})

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
  for (const app of apps.splice(0)) app.cleanup()
})

function newApp(files: Record<string, string>, cli: "real" | "fake" | "none") {
  const app = createApp(files, cli)
  apps.push(app)
  return app
}

/** `startDev`, closed when the test is over. */
async function serve(
  root: string,
  options: IcReactorPluginOptions,
  extra?: Parameters<typeof startDev>[2]
): Promise<Running> {
  const running = await startDev(root, options, extra)
  closers.push(running.close)
  return running
}

const exists = (app: App, file: string) =>
  fs.existsSync(path.join(app.root, file))

describe("generation under vite dev", () => {
  it("logs the guide line before anything else", async () => {
    const app = newApp({ "did/ledger.did": LEDGER }, "real")
    const { lines } = await serve(app.root, {
      canisters: { ledger: { didFile: "did/ledger.did" } },
    })

    expect(lines[0]).toBe(`info: ${GUIDE}`)
    expect(lines[1]).toContain("generated ledger into src/canisters/ledger.ts")
  })

  // A generator failure must cost the canister it failed on, not the dev
  // server. The broken file's diagnostics come from the real generator.
  it("fails the canister whose .did the generator rejects, and keeps serving", async () => {
    const app = newApp(
      { "did/ledger.did": LEDGER, "did/bad.did": BROKEN_DID },
      "real"
    )
    const { port, lines } = await serve(app.root, {
      canisters: {
        ledger: { didFile: "did/ledger.did" },
        bad: { didFile: "did/bad.did" },
      },
    })

    const page = await get(port, "/")
    expect(page.status).toBe(200)
    expect(page.body).toContain("/main.js")

    expect(exists(app, "src/canisters/ledger.ts")).toBe(true)
    expect(exists(app, "src/canisters/bad.ts")).toBe(false)
    const errors = lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("could not generate 1 of 2 canisters")
    expect(errors[0]).toContain("bad (did/bad.did)")
    expect(errors[0]).toContain("did_parse_error")
    expect(errors[0]).not.toContain("ledger (")
  })

  it("keeps serving when the generator process crashes, and fails only the canister it crashed on", async () => {
    const app = newApp(
      { "did/good.did": PING_DID, "did/trap.did": "TRAP\n" },
      "fake"
    )
    const { port, lines } = await serve(app.root, {
      canisters: {
        good: { didFile: "did/good.did" },
        trap: { didFile: "did/trap.did" },
      },
    })

    expect((await get(port, "/")).status).toBe(200)
    const error = lines.find((line) => line.startsWith("error:")) ?? ""
    expect(error).toContain("could not generate 1 of 2 canisters")
    expect(error).toContain("trap (did/trap.did)")
    expect(error).toContain("exited with code 101")
    expect(error).toContain("unreachable executed (fake trap)")
    expect(error).not.toContain("good (")
    expect(lines).toContainEqual(
      expect.stringContaining("generated good into src/canisters/good.ts")
    )
    // What the crashed process wrote is also logged as it wrote it: by the
    // process for both, and by the one for the canister that crashed it.
    expect(lines).toContain(
      "warn: ic-reactor: candid-core-cli (did/good.did, did/trap.did): RuntimeError: unreachable executed (fake trap)"
    )
    expect(lines).toContain(
      "warn: ic-reactor: candid-core-cli (did/trap.did): RuntimeError: unreachable executed (fake trap)"
    )
    // One process for both, which crashed, then one for each.
    expect(generatorRuns().map((dids) => dids.length)).toEqual([2, 1, 1])
  })

  // AC5: a save regenerates its own canister and nothing else.
  it("regenerates only the canister whose .did changed", async () => {
    const app = newApp(
      {
        "did/a.did": PING_DID,
        "did/b.did": "service : { pong : () -> () };\n",
      },
      "real"
    )
    const { server } = await serve(app.root, {
      canisters: {
        a: { didFile: "did/a.did" },
        b: { didFile: "did/b.did" },
      },
    })
    const a = path.join(app.root, "did/a.did")
    const b = path.join(app.root, "did/b.did")
    // One process generated both at startup.
    expect(generatorRuns()).toEqual([[a, b]])

    fs.writeFileSync(a, "service : { ping : () -> (); more : () -> () };\n")
    server.watcher.emit("change", a)

    const moduleOfA = path.join(app.root, "src/canisters/a.ts")
    await vi.waitFor(() =>
      expect(fs.readFileSync(moduleOfA, "utf-8")).toContain("more")
    )
    expect(generatorRuns()).toEqual([[a, b], [a]])

    // Neither a file that is no canister's nor a `.did` that none names is.
    server.watcher.emit("change", path.join(app.root, "main.js"))
    server.watcher.emit("change", path.join(app.root, "did/other.did"))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(generatorRuns()).toHaveLength(2)
  })

  // Many canisters, one interface: an ICP ledger and a ckBTC ledger on one
  // `icrc1.did`. A save is one run for the file, not one for each name.
  it("regenerates canisters that share a .did together, in one process", async () => {
    const app = newApp(
      { "did/icrc1.did": PING_DID, "did/b.did": PING_DID },
      "real"
    )
    const { server, lines } = await serve(app.root, {
      canisters: {
        ckbtc_ledger: { didFile: "did/icrc1.did" },
        icp_ledger: { didFile: "did/icrc1.did" },
        other: { didFile: "did/b.did" },
      },
    })
    const shared = path.join(app.root, "did/icrc1.did")
    const other = path.join(app.root, "did/b.did")
    // Startup: one process, and the shared file once.
    expect(generatorRuns()).toEqual([[shared, other]])
    expect(lines).toContain(
      "info: ic-reactor: generated ckbtc_ledger, icp_ledger into src/canisters/icrc1.ts"
    )
    expect(lines.filter((line) => line.startsWith("error:"))).toEqual([])

    fs.writeFileSync(
      shared,
      "service : { ping : () -> (); more : () -> () };\n"
    )
    server.watcher.emit("change", shared)
    await vi.waitFor(() => expect(generatorRuns()).toHaveLength(2))
    await vi.waitFor(() =>
      expect(
        fs.readFileSync(path.join(app.root, "src/canisters/icrc1.ts"), "utf-8")
      ).toContain("more")
    )
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(generatorRuns()).toEqual([[shared, other], [shared]])
    expect(lines).toContain(
      "info: ic-reactor: did/icrc1.did changed, regenerating ckbtc_ledger, icp_ledger"
    )
  })

  it("tells the watcher about each configured .did, and regenerates one that is added again", async () => {
    const app = newApp({ "did/a.did": PING_DID, "did/b.did": PING_DID }, "real")
    const watching: Plugin = {
      name: "spy-on-watcher",
      enforce: "pre",
      configureServer(server) {
        vi.spyOn(server.watcher, "add")
      },
    }
    const { server } = await serve(
      app.root,
      {
        canisters: {
          a: { didFile: "did/a.did" },
          b: { didFile: "did/b.did" },
        },
      },
      { before: [watching] }
    )

    expect(server.watcher.add).toHaveBeenCalledWith([
      path.join(app.root, "did/a.did"),
      path.join(app.root, "did/b.did"),
    ])

    // `git checkout` and most editors' atomic saves arrive as an add.
    server.watcher.emit("add", path.join(app.root, "did/b.did"))
    await vi.waitFor(() => expect(generatorRuns()).toHaveLength(2))
    expect(generatorRuns()[1]).toEqual([path.join(app.root, "did/b.did")])
  })

  // The one test that lets the real watcher deliver the event.
  it("regenerates when the .did is edited on disk", async () => {
    const app = newApp({ "did/a.did": PING_DID }, "real")
    await serve(
      app.root,
      { canisters: { a: { didFile: "did/a.did" } } },
      { realWatcher: true }
    )

    fs.writeFileSync(
      path.join(app.root, "did/a.did"),
      "service : { ping : () -> (); more : () -> () };\n"
    )

    await vi.waitFor(
      () =>
        expect(
          fs.readFileSync(path.join(app.root, "src/canisters/a.ts"), "utf-8")
        ).toContain("more"),
      { timeout: 10_000 }
    )
  })

  // Saves that land while a run is in flight collapse into one more run, so
  // the last saved file wins and runs do not pile up.
  it("collapses saves that arrive during a run into one run after it", async () => {
    const app = newApp({ "did/a.did": "SLOW\n" }, "fake")
    const { server, lines } = await serve(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })
    const a = path.join(app.root, "did/a.did")
    const generated = () =>
      lines.filter((line) => line.includes("generated a into")).length
    expect(generated()).toBe(1)

    server.watcher.emit("change", a)
    await vi.waitFor(() => expect(generatorRuns()).toHaveLength(2))
    // The second run is in flight now.
    server.watcher.emit("change", a)
    server.watcher.emit("change", a)
    server.watcher.emit("change", a)

    await vi.waitFor(() => expect(generated()).toBe(3), { timeout: 5000 })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(generatorRuns()).toHaveLength(3)
    expect(generated()).toBe(3)
  })

  it("logs the declarations the generator left out", async () => {
    const app = newApp(
      {
        "did/holder.did":
          "type Bad = record { _1_ : nat };\n" +
          "service : { f : (Bad) -> (); g : () -> () query };\n",
      },
      "real"
    )
    const { lines } = await serve(app.root, {
      canisters: { holder: { didFile: "did/holder.did" } },
    })

    expect(lines).toContain(
      "warn: ic-reactor: holder: omitted declaration Bad (reserved_field_name)"
    )
    expect(lines).toContain(
      "warn: ic-reactor: holder: omitted method f (references_omitted via Bad)"
    )
    expect(lines.filter((line) => line.startsWith("error:"))).toEqual([])
  })

  describe("the error overlay", () => {
    /**
     * Capture what the plugin registers on the WebSocket server. A listener is
     * handed the connecting client as Vite hands it: a socket with `send`.
     */
    function spyOnConnections() {
      const connections: Array<(client?: unknown) => void> = []
      const plugin: Plugin = {
        name: "spy-on-connections",
        enforce: "pre",
        configureServer(server) {
          vi.spyOn(server.ws, "on").mockImplementation(((
            event: string,
            callback: (client?: unknown) => void
          ) => {
            if (event === "connection") connections.push(callback)
          }) as never)
        },
      }
      return { connections, plugin }
    }

    const errorPayload = (message: string) => ({
      type: "error",
      err: expect.objectContaining({
        message: expect.stringContaining(message),
      }),
    })

    it("is handed a failure to a browser that connects after it, and cleared when the .did is fixed", async () => {
      const app = newApp({ "did/bad.did": BROKEN_DID }, "real")
      const { connections, plugin } = spyOnConnections()
      const { server } = await serve(
        app.root,
        { canisters: { bad: { didFile: "did/bad.did" } } },
        { before: [plugin] }
      )
      const send = vi.spyOn(server.ws, "send")

      // Startup finished before any browser could connect, so the failure was
      // sent to nobody. A browser that connects now is handed it, and only
      // that one: the others have it, or are handed it when they connect.
      expect(connections).toHaveLength(1)
      const client = { send: vi.fn() }
      connections[0](client)
      expect(client.send).toHaveBeenCalledTimes(1)
      expect(JSON.parse(client.send.mock.calls[0][0])).toEqual(
        errorPayload("did_parse_error")
      )
      expect(send).not.toHaveBeenCalled()

      // Fixing the file clears the overlay: nothing else would reload the
      // page, since the broken run wrote no file.
      const bad = path.join(app.root, "did/bad.did")
      fs.writeFileSync(bad, PING_DID)
      server.watcher.emit("change", bad)
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith({ type: "full-reload" })
      )
      send.mockClear()
      client.send.mockClear()
      connections[0](client)
      expect(client.send).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    })

    // The real WebSocket server, and real browsers' sockets: a browser that
    // connects is handed the failure, and the ones already connected are not
    // handed it again.
    it("reaches the browser that connects, and no other", async () => {
      const app = newApp({ "did/bad.did": BROKEN_DID }, "real")
      const { port } = await serve(app.root, {
        canisters: { bad: { didFile: "did/bad.did" } },
      })

      const browsers: WebSocket[] = []
      const connect = async () => {
        const messages: Array<{ type: string }> = []
        const socket = new WebSocket(`ws://127.0.0.1:${port}/`, "vite-hmr")
        browsers.push(socket)
        socket.addEventListener("message", (event) =>
          messages.push(JSON.parse(String(event.data)))
        )
        await vi.waitFor(() =>
          expect(messages.map(({ type }) => type)).toContain("error")
        )
        return messages
      }
      try {
        const first = await connect()
        const seen = first.length

        const second = await connect()
        await new Promise((resolve) => setTimeout(resolve, 200))

        expect(second.map(({ type }) => type)).toContain("error")
        expect(first).toHaveLength(seen)
      } finally {
        for (const browser of browsers) browser.close()
      }
    })

    // A WebSocket that does not hand over the client is the fallback.
    it("is sent to every browser when the connection listener is handed no client", async () => {
      const app = newApp({ "did/bad.did": BROKEN_DID }, "real")
      const { connections, plugin } = spyOnConnections()
      const { server } = await serve(
        app.root,
        { canisters: { bad: { didFile: "did/bad.did" } } },
        { before: [plugin] }
      )
      const send = vi.spyOn(server.ws, "send")

      connections[0]()

      expect(send).toHaveBeenCalledWith(errorPayload("did_parse_error"))
    })

    it("lists only the canisters still broken when another one is fixed", async () => {
      const app = newApp(
        { "did/a.did": BROKEN_DID, "did/b.did": BROKEN_DID },
        "real"
      )
      const { server } = await serve(app.root, {
        canisters: {
          a: { didFile: "did/a.did" },
          b: { didFile: "did/b.did" },
        },
      })
      const send = vi.spyOn(server.ws, "send")

      const a = path.join(app.root, "did/a.did")
      fs.writeFileSync(a, PING_DID)
      server.watcher.emit("change", a)

      // The overlay that listed both is replaced by one that lists b alone.
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          errorPayload("could not generate 1 of 2 canisters")
        )
      )
      const [{ err }] = send.mock.calls[
        send.mock.calls.length - 1
      ] as unknown as [{ err: { message: string } }]
      const { message } = err
      expect(message).toContain("b (did/b.did)")
      expect(message).not.toContain("a (did/a.did)")
      expect(send).not.toHaveBeenCalledWith({ type: "full-reload" })

      // Fixing the last one reloads the page.
      const b = path.join(app.root, "did/b.did")
      fs.writeFileSync(b, PING_DID)
      server.watcher.emit("change", b)
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith({ type: "full-reload" })
      )
    })
  })

  // `server.hmr: false` leaves Vite a WebSocket server that does nothing, and
  // a failure still must not end the server.
  it("reports a failure and keeps serving when the server has no WebSocket", async () => {
    const app = newApp(
      { "did/ledger.did": LEDGER, "did/bad.did": BROKEN_DID },
      "real"
    )
    const { server, port, lines } = await serve(
      app.root,
      {
        canisters: {
          ledger: { didFile: "did/ledger.did" },
          bad: { didFile: "did/bad.did" },
        },
      },
      { hmr: false }
    )
    expect((await get(port, "/")).status).toBe(200)
    expect(lines.filter((line) => line.startsWith("error:"))).toHaveLength(1)

    // Saving the broken file again fails again, and fixing it succeeds.
    const bad = path.join(app.root, "did/bad.did")
    server.watcher.emit("change", bad)
    await vi.waitFor(() =>
      expect(lines.filter((line) => line.startsWith("error:"))).toHaveLength(2)
    )
    fs.writeFileSync(bad, PING_DID)
    server.watcher.emit("change", bad)
    await vi.waitFor(() =>
      expect(exists(app, "src/canisters/bad.ts")).toBe(true)
    )
  })

  it("fails the dev server's startup when failOnError is on", async () => {
    const app = newApp({ "did/bad.did": BROKEN_DID }, "real")

    await expect(
      serve(app.root, {
        failOnError: true,
        canisters: { bad: { didFile: "did/bad.did" } },
      })
    ).rejects.toThrow("did_parse_error")
  })
})

describe("generation under vite build", () => {
  // AC6: the real generator, on a real interface.
  it("generates the ICRC-1 ledger module with the real candid-core-cli", async () => {
    const app = newApp({ "did/icrc1.did": LEDGER }, "real")
    const { result, lines } = buildApp(app.root, {
      canisters: { ledger: { didFile: "did/icrc1.did" } },
    })
    await result

    const module = fs.readFileSync(
      path.join(app.root, "src/canisters/icrc1.ts"),
      "utf-8"
    )
    expect(module).toContain("export { $actor as actor, type $Actor as Actor }")
    expect(module).toContain("icrc1_transfer")
    const envelope = JSON.parse(
      fs.readFileSync(
        path.join(app.root, "src/canisters/icrc1.envelope.json"),
        "utf-8"
      )
    )
    expect(envelope).toHaveProperty("contract")
    expect(lines).toContain(
      "info: ic-reactor: generated ledger into src/canisters/icrc1.ts"
    )
    expect(generatorRuns()).toEqual([[path.join(app.root, "did/icrc1.did")]])
  })

  it("writes into the outDir of each canister, one process for each directory", async () => {
    const app = newApp({ "did/a.did": PING_DID, "did/b.did": PING_DID }, "real")
    const { result } = buildApp(app.root, {
      canisters: {
        a: { didFile: "did/a.did", outDir: "gen/a" },
        b: { didFile: "did/b.did", outDir: "gen/b" },
      },
    })
    await result

    expect(exists(app, "gen/a/a.ts")).toBe(true)
    expect(exists(app, "gen/b/b.ts")).toBe(true)
    expect(generatorRuns()).toHaveLength(2)
  })

  // AC1, `vite build` half: a non-zero build, with what the generator said.
  it("rejects with the diagnostics of a .did the generator rejects", async () => {
    const app = newApp(
      { "did/ledger.did": LEDGER, "did/bad.did": BROKEN_DID },
      "real"
    )
    const { result } = buildApp(app.root, {
      canisters: {
        ledger: { didFile: "did/ledger.did" },
        bad: { didFile: "did/bad.did" },
      },
    })

    await expect(result).rejects.toThrow(
      /could not generate 1 of 2 canisters:\n {2}- bad \(did\/bad\.did\): did_parse_error: Candid parser error/
    )
    // The other canister was generated all the same.
    expect(exists(app, "src/canisters/ledger.ts")).toBe(true)
  })

  it("rejects with the stderr of a generator that crashes", async () => {
    const app = newApp({ "did/trap.did": "TRAP\n" }, "fake")
    const { result } = buildApp(app.root, {
      canisters: { trap: { didFile: "did/trap.did" } },
    })

    await expect(result).rejects.toThrow(
      /candid-core-cli exited with code 101\n {4}RuntimeError: unreachable executed \(fake trap\)/
    )
  })

  it("rejects a report whose schemaVersion it does not know", async () => {
    const app = newApp({ "did/a.did": "NEWER\n" }, "fake")
    const { result } = buildApp(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })

    await expect(result).rejects.toThrow(
      /its report has schemaVersion 2, and this plugin reads 1; install @candid-core\/cli@0\.2\.0-beta\.1/
    )
  })

  it("logs what a generator that succeeded wrote to stderr, a line at a time", async () => {
    const app = newApp({ "did/a.did": "NOISY\n" }, "fake")
    const { result, lines } = buildApp(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })

    await result
    // The second line has no newline: it is passed on when the process ends.
    expect(lines).toContain(
      "warn: ic-reactor: candid-core-cli (did/a.did): warning: first (fake)"
    )
    expect(lines).toContain(
      "warn: ic-reactor: candid-core-cli (did/a.did): warning: second (fake)"
    )
  })

  // A run that is slow says what it has to say while it runs, not when it is
  // over.
  it("logs stderr while the generator is still running", async () => {
    const app = newApp({ "did/a.did": "PROGRESS\n" }, "fake")
    const { result, lines } = buildApp(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })
    let finished = false
    void result.then(() => (finished = true))

    await vi.waitFor(() =>
      expect(lines).toContain(
        "warn: ic-reactor: candid-core-cli (did/a.did): progress: step 1 (fake)"
      )
    )
    expect(finished).toBe(false)
    await result
    // The line was passed on whole, not in the two pieces it was written in.
    expect(lines.filter((line) => line.includes("progress:"))).toHaveLength(1)
  })

  // The generator prints nothing on stderr when all is well, so a process
  // that prints without end is a runaway one, which the logger is spared.
  it("stops logging the stderr of a process that prints without end", async () => {
    const app = newApp({ "did/a.did": "FLOOD\n" }, "fake")
    const { result, lines } = buildApp(app.root, {
      canisters: { a: { didFile: "did/a.did" } },
    })

    await result
    const logged = lines.filter((line) =>
      line.startsWith("warn: ic-reactor: candid-core-cli (did/a.did): ")
    )
    expect(logged).toHaveLength(201)
    expect(logged[199]).toContain("line 200 (fake)")
    expect(logged[200]).toContain(
      "more than 200 lines on stderr: the rest is not logged"
    )
  })

  it("only logs the failure when failOnError is off", async () => {
    const app = newApp({ "did/bad.did": BROKEN_DID }, "real")
    const { result, lines } = buildApp(app.root, {
      failOnError: false,
      canisters: { bad: { didFile: "did/bad.did" } },
    })

    await result
    expect(lines.filter((line) => line.startsWith("error:"))).toEqual([
      expect.stringContaining("did_parse_error"),
    ])
  })

  it("says what to install when the app has no @candid-core/cli", async () => {
    const app = newApp({ "did/a.did": PING_DID, "did/b.did": PING_DID }, "none")

    await withoutNodePath(async () => {
      const { result } = buildApp(app.root, {
        canisters: {
          a: { didFile: "did/a.did" },
          b: { didFile: "did/b.did" },
        },
      })

      // Both canisters fail for one reason, which is said once.
      await expect(result).rejects.toThrow(
        /could not generate 2 of 2 canisters:\n {2}- a \(did\/a\.did\), b \(did\/b\.did\): cannot find @candid-core\/cli from .*npm install --save-dev --save-exact @candid-core\/cli@0\.2\.0-beta\.1/s
      )
    })
    expect(generatorRuns()).toEqual([])
  })

  // Many canisters, one interface: each is named so that the `ic_env` cookie
  // carries its ID, and they share the one module the generator writes.
  it("generates one module for canisters that share a .did", async () => {
    const app = newApp({ "did/icrc1.did": LEDGER }, "real")
    const { result, lines } = buildApp(app.root, {
      canisters: {
        ckbtc_ledger: { didFile: "did/icrc1.did" },
        icp_ledger: { didFile: "did/icrc1.did" },
      },
    })
    await result

    expect(exists(app, "src/canisters/icrc1.ts")).toBe(true)
    // The generator was given the file once.
    expect(generatorRuns()).toEqual([[path.join(app.root, "did/icrc1.did")]])
    expect(lines).toContain(
      "info: ic-reactor: generated ckbtc_ledger, icp_ledger into src/canisters/icrc1.ts"
    )
  })

  it("fails each canister that shares a .did the generator rejects, with one message", async () => {
    const app = newApp({ "did/bad.did": BROKEN_DID }, "real")
    const { result } = buildApp(app.root, {
      canisters: {
        a: { didFile: "did/bad.did" },
        b: { didFile: "did/bad.did" },
      },
    })

    await expect(result).rejects.toThrow(
      /could not generate 2 of 2 canisters:\n {2}- a \(did\/bad\.did\), b \(did\/bad\.did\): did_parse_error/
    )
    expect(generatorRuns()).toHaveLength(1)
  })

  it("generates one module for each outDir when canisters share a .did across directories", async () => {
    const app = newApp({ "did/a.did": PING_DID }, "real")
    const { result } = buildApp(app.root, {
      canisters: {
        one: { didFile: "did/a.did", outDir: "gen/one" },
        two: { didFile: "did/a.did", outDir: "gen/two" },
      },
    })
    await result

    expect(exists(app, "gen/one/a.ts")).toBe(true)
    expect(exists(app, "gen/two/a.ts")).toBe(true)
    expect(generatorRuns()).toHaveLength(2)
  })

  it("refuses two canisters that would write the same file and generates the other", async () => {
    const app = newApp(
      {
        "one/ledger.did": PING_DID,
        "two/ledger.did": PING_DID,
        "three/other.did": PING_DID,
      },
      "real"
    )
    const { result } = buildApp(app.root, {
      canisters: {
        first: { didFile: "one/ledger.did" },
        // A canister that shares the refused file is refused with it.
        second: { didFile: "two/ledger.did" },
        second_too: { didFile: "two/ledger.did" },
        third: { didFile: "three/other.did" },
      },
    })

    await expect(result).rejects.toThrow(
      /second \(two\/ledger\.did\), second_too \(two\/ledger\.did\): would write src\/canisters\/ledger\.ts, which "first" already writes/
    )
    expect(exists(app, "src/canisters/ledger.ts")).toBe(true)
    expect(exists(app, "src/canisters/other.ts")).toBe(true)
  })

  it("generates nothing for a canister that has no .did", async () => {
    const app = newApp({}, "real")
    const { result } = buildApp(app.root, {
      canisters: {
        frontend: {},
        backend: { canisterId: "bkyz2-fmaaa-aaaaa-qaaaq-cai" },
      },
    })

    await result
    expect(generatorRuns()).toEqual([])
  })

  // `vite build --watch` calls buildStart again on every rebuild, and Vite 6
  // and later call it once for each environment.
  it("skips a canister whose .did is unchanged since it last generated", async () => {
    const app = newApp({ "did/a.did": PING_DID }, "real")
    const plugin = icReactor({
      canisters: { a: { didFile: "did/a.did" } },
    }) as Plugin & {
      configResolved: (config: unknown) => void
      buildStart: (this: unknown) => Promise<void>
    }
    const { logger } = recordingLogger()
    plugin.configResolved({ root: app.root, command: "build", logger })
    const context = { addWatchFile: vi.fn(), error: vi.fn() }

    await plugin.buildStart.call(context)
    await plugin.buildStart.call(context)
    expect(generatorRuns()).toHaveLength(1)

    fs.writeFileSync(
      path.join(app.root, "did/a.did"),
      "service : { changed : () -> () };\n"
    )
    await plugin.buildStart.call(context)
    expect(generatorRuns()).toHaveLength(2)
    expect(context.addWatchFile).toHaveBeenCalledWith(
      path.join(app.root, "did/a.did")
    )
  })
})
