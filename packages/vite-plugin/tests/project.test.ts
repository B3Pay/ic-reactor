/**
 * Phase 2 of fetching: `methods`, which writes a fetched `didFile` as the
 * projection of the live interface to the methods the app calls, and the
 * live check (`verify: "live"`, `IC_REACTOR_VERIFY`), which checks a
 * `didFile` on disk against the live canister. Both run the real
 * `@candid-core/cli` (`project`, `check`) under a real `vite build`.
 *
 * The canisters live on the fake replica of tests/fake-ic.ts, on a local
 * port, which signs its certificates with a root key of its own.
 */
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Plugin } from "vite"
import { icReactor, type IcReactorPluginOptions } from "../src/index.js"
import { startFakeIc, type Canister } from "./fake-ic.js"
import {
  createApp,
  LEDGER_DID,
  PING_DID,
  recordingLogger,
  runBuild,
  startDev,
  type App,
} from "./support.js"

const LEDGER = fs.readFileSync(LEDGER_DID, "utf-8")
const LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OTHER_ID = "mqygn-kiaaa-aaaar-qaadq-cai"

const closers: Array<() => Promise<unknown>> = []
const apps: App[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const close of closers.splice(0).reverse()) await close()
  for (const app of apps.splice(0)) app.cleanup()
})

function newApp(files: Record<string, string>) {
  const app = createApp(files, "real")
  apps.push(app)
  return app
}

async function fakeIc(canisters: Parameters<typeof startFakeIc>[0]) {
  const ic = await startFakeIc(canisters)
  closers.push(ic.close)
  return ic
}

/** A `fetch` that refuses every request and remembers what it was asked. */
function refuseNetwork(): string[] {
  const asked: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      asked.push(String(input instanceof Request ? input.url : input))
      return Promise.reject(
        new TypeError("fetch failed: the test refuses the network")
      )
    })
  )
  return asked
}

const read = (app: App, file: string) =>
  fs.readFileSync(path.join(app.root, file), "utf-8")
const exists = (app: App, file: string) =>
  fs.existsSync(path.join(app.root, file))

/** What a build threw, as text, and what it logged. */
async function buildError(app: App, options: IcReactorPluginOptions) {
  const { result, lines } = runBuild(app.root, options)
  const message = await result.then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  )
  return { message, lines }
}

/** The line of a failure message that names `name`. */
const lineOf = (message: string, name: string) =>
  message.split("\n").find((line) => line.includes(`- ${name} (`)) ?? ""

// `as const`: the option takes a readonly list.
const METHODS = ["icrc1_transfer", "icrc1_balance_of"] as const

describe("methods", () => {
  it("writes a missing didFile as the projection of the live interface to them, and a second build makes no request", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const options: IcReactorPluginOptions = {
      canisters: {
        ledger: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: METHODS,
        },
      },
    }

    const first = runBuild(app.root, options)
    await first.result
    const did = read(app, "did/ledger.did")
    expect(did).toContain("icrc1_balance_of : (Account) -> (Tokens) query;")
    expect(did).toContain("icrc1_transfer : (TransferArg) -> (TransferResult);")
    // Nothing the two methods do not reach: no other method, and not the
    // init arguments of the ledger's service class.
    expect(did).not.toContain("icrc1_name")
    expect(did).not.toContain("InitArgs")
    expect(did).not.toContain("ledger_arg")
    expect(first.lines).toContainEqual(
      expect.stringContaining(
        `wrote did/ledger.did from the certified candid:service of ${LEDGER_ID} on ${ic.host}, projected to icrc1_balance_of, icrc1_transfer (`
      )
    )
    const module = read(app, "src/canisters/ledger.ts")
    expect(module).toContain("icrc1_transfer")
    expect(module).not.toContain("icrc1_name")
    expect(ic.requests).toEqual([
      "GET /api/v2/status",
      `POST /api/v3/canister/${LEDGER_ID}/read_state`,
    ])

    // The projection on disk matches its methods: read, compared and
    // generated with no request.
    const second = runBuild(app.root, options)
    await second.result
    expect(ic.requests).toHaveLength(2)
    expect(read(app, "did/ledger.did")).toBe(did)
    expect(second.lines.filter((line) => line.startsWith("warn:"))).toEqual([])
  })

  it("with a name the live interface lacks fails, naming it and the canister's methods, and writes nothing", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({ "did/ping.did": PING_DID })
    const { message } = await buildError(app, {
      canisters: {
        ping: { didFile: "did/ping.did" },
        ledger: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer", "icrc1_transfr"],
        },
      },
    })
    expect(message).toContain("could not generate 1 of 2 canisters")
    const line = lineOf(message, "ledger")
    expect(line).toContain(
      `ledger (did/ledger.did): methods names icrc1_transfr, which the live interface of ${LEDGER_ID} on ${ic.host} does not have, so did/ledger.did is not written.`
    )
    expect(line).toContain(
      "It has 10 methods: icrc1_balance_of, icrc1_decimals, icrc1_fee,"
    )
    expect(exists(app, "did/ledger.did")).toBe(false)
    expect(exists(app, "src/canisters/ledger.ts")).toBe(false)
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
  })

  it("of canisters that share a missing didFile must be one list, or nothing is fetched", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const network = { host: ic.host }
    const { message } = await buildError(app, {
      canisters: {
        a: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_transfer", "icrc1_fee"],
        },
        // The same list in another order is the same projection.
        b: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_fee", "icrc1_transfer"],
          outDir: "src/b",
        },
        c: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_fee"],
          outDir: "src/c",
        },
      },
    })
    expect(message).toContain(
      `"a", "b", "c" name did/ledger.did but not one list of methods to project it to (` +
        `a: icrc1_fee, icrc1_transfer; b: icrc1_fee, icrc1_transfer; c: icrc1_fee): ` +
        `the file holds one projection, which every one of them generates from, so it is not fetched.`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)

    // Without c, a and b share one fetch.
    const { result } = runBuild(app.root, {
      canisters: {
        a: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_transfer", "icrc1_fee"],
        },
        b: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_fee", "icrc1_transfer"],
          outDir: "src/b",
        },
      },
    })
    await result
    expect(ic.requests).toHaveLength(2)
    expect(read(app, "did/ledger.did")).not.toContain("icrc1_name")
  })

  it("of a canister with no canisterId count when it shares a missing didFile: no methods is the whole interface, and nothing is fetched", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const options: IcReactorPluginOptions = {
      canisters: {
        // Only this entry can fetch the file, for one method.
        transfer: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer"],
        },
        // It reads the same file, and wants the whole interface.
        ledger: { didFile: "did/ledger.did", outDir: "src/whole" },
      },
    }
    const { message } = await buildError(app, options)
    const refusal =
      `"transfer", "ledger" name did/ledger.did but not one list of methods to project it to (` +
      `transfer: icrc1_transfer; ledger: no methods, the whole interface): ` +
      `the file holds one projection, which every one of them generates from, so it is not fetched. ` +
      `Give them one list, or give each list a didFile of its own.`
    // One message for both, on one line.
    expect(message).toContain(
      `- transfer (did/ledger.did), ledger (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)
    expect(exists(app, "src/canisters/transfer.ts")).toBe(false)
    expect(exists(app, "src/whole/ledger.ts")).toBe(false)

    // A file on disk is read by both, with no request, and still compared
    // with each list: the whole interface holds more than icrc1_transfer.
    fs.mkdirSync(path.join(app.root, "did"), { recursive: true })
    fs.writeFileSync(path.join(app.root, "did/ledger.did"), LEDGER)
    const onDisk = runBuild(app.root, options)
    await onDisk.result
    expect(ic.requests).toEqual([])
    expect(onDisk.lines).toContainEqual(
      expect.stringContaining(
        "ic-reactor: transfer: did/ledger.did also holds icrc1_balance_of,"
      )
    )
    expect(read(app, "src/whole/ledger.ts")).toContain("icrc1_name")

    // Named by IC_REACTOR_FETCH while on disk, the file is to be fetched
    // again: the lists are compared before the request, as for a missing one.
    vi.stubEnv("IC_REACTOR_FETCH", "transfer")
    const again = await buildError(app, options)
    expect(again.message).toContain(
      `- transfer (did/ledger.did), ledger (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(read(app, "did/ledger.did")).toBe(LEDGER)
  })

  it("of a canister with no canisterId that names another list for a shared missing didFile refuse the fetch, naming each list", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const { message } = await buildError(app, {
      canisters: {
        transfer: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer", "icrc1_fee"],
        },
        balance: {
          didFile: "did/ledger.did",
          outDir: "src/balance",
          methods: ["icrc1_balance_of"],
        },
      },
    })
    const refusal =
      `"transfer", "balance" name did/ledger.did but not one list of methods to project it to (` +
      `transfer: icrc1_fee, icrc1_transfer; balance: icrc1_balance_of)`
    // One message for both, on one line.
    expect(message).toContain(
      `- transfer (did/ledger.did), balance (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)
  })

  it("of a canister with no canisterId that cannot be projected to refuse a shared missing didFile's fetch", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const { message } = await buildError(app, {
      canisters: {
        transfer: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer"],
        },
        broken: {
          didFile: "did/ledger.did",
          outDir: "src/broken",
          methods: ["icrc1_transfer,icrc1_fee"],
        },
      },
    })
    const refusal =
      `"transfer", "broken" name did/ledger.did, which is not fetched, since "broken" cannot be generated ` +
      `(broken: methods names "icrc1_transfer,icrc1_fee", which has a comma`
    // One message for both, on one line.
    expect(message).toContain(
      `- transfer (did/ledger.did), broken (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)
  })

  it("refuses an empty list and a name with a comma, with no request", async () => {
    const asked = refuseNetwork()
    const app = newApp({})
    const { message } = await buildError(app, {
      canisters: {
        none: {
          didFile: "did/none.did",
          canisterId: LEDGER_ID,
          methods: [],
        },
        comma: {
          didFile: "did/comma.did",
          canisterId: LEDGER_ID,
          methods: ["a,b"],
        },
      },
    })
    expect(lineOf(message, "none")).toContain(
      "none (did/none.did): methods is empty"
    )
    expect(lineOf(message, "comma")).toContain(
      `comma (did/comma.did): methods names "a,b", which has a comma`
    )
    expect(asked).toEqual([])
  })

  // A JavaScript config is not type-checked: only an omitted list is the
  // whole interface, and every value given is checked as a list.
  it("given as null, false, 0 or an empty string fail the canister of a didFile on disk, with no request", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/ping.did": PING_DID })
    for (const methods of [null, false, 0, ""]) {
      const { message } = await buildError(app, {
        canisters: {
          ping: { didFile: "did/ping.did", methods: methods as never },
        },
      })
      expect(lineOf(message, "ping")).toContain(
        `ping (did/ping.did): methods is ${JSON.stringify(methods)}, not a list of method names`
      )
    }
    expect(exists(app, "src/canisters/ping.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  it("of a didFile on disk are compared with it, with no request: a name it lacks fails, and a method it has too is a warning", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/ledger.did": LEDGER })
    const base = {
      didFile: "did/ledger.did",
      canisterId: LEDGER_ID,
      network: "ic" as const,
    }

    // The file has every method of the list, and more.
    const { result, lines } = runBuild(app.root, {
      canisters: { ledger: { ...base, methods: METHODS } },
    })
    await result
    expect(lines).toContainEqual(
      expect.stringContaining(
        "warn: ic-reactor: ledger: did/ledger.did also holds icrc1_decimals, icrc1_fee, icrc1_metadata,"
      )
    )
    expect(lines).toContainEqual(
      expect.stringContaining(
        "which methods does not name, so its module has them too. Fetch it again with IC_REACTOR_FETCH=ledger to write the projection to methods."
      )
    )
    expect(exists(app, "src/canisters/ledger.ts")).toBe(true)

    // The list names a method the file does not hold.
    const { message } = await buildError(app, {
      canisters: {
        ledger: { ...base, methods: [...METHODS, "icrc2_approve"] },
      },
    })
    expect(lineOf(message, "ledger")).toContain(
      "ledger (did/ledger.did): methods names icrc2_approve, which did/ledger.did does not hold (it holds icrc1_balance_of,"
    )
    expect(lineOf(message, "ledger")).toContain(
      "Fetch it again with IC_REACTOR_FETCH=ledger to write the projection to methods, or take the name out of methods."
    )
    expect(asked).toEqual([])
    expect(read(app, "did/ledger.did")).toBe(LEDGER)
  })

  it("are compared with a didFile saved under vite dev, with no request", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN })
    const running = await startDev(app.root, {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          methods: ["get", "maybe", "put"],
        },
      },
    })
    closers.push(running.close)
    expect(running.lines.filter((line) => line.startsWith("error:"))).toEqual(
      []
    )

    // A save that drops a method the list names.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, WRITTEN.replace("  put : (nat) -> ();\n", ""))
    running.server.watcher.emit("change", file)
    await vi.waitFor(() =>
      expect(running.lines).toContainEqual(
        expect.stringContaining(
          "item (did/item.did): methods names put, which did/item.did does not hold (it holds get, maybe)"
        )
      )
    )
    expect(asked).toEqual([])
  })

  // The names are listed with a projection to a name no service can have.
  // One that a service can have, as the name the plugin once asked for, lists
  // nothing when the service has it.
  it("of a didFile are compared with it whatever its methods are named", async () => {
    const asked = refuseNetwork()
    const app = newApp({
      "did/item.did": WRITTEN.replace(
        "service : {\n",
        'service : {\n  "ic-reactor list methods" : () -> ();\n'
      ),
    })
    const { message } = await buildError(app, {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          methods: ["get", "absent"],
        },
      },
    })
    expect(lineOf(message, "item")).toContain(
      "item (did/item.did): methods names absent, which did/item.did does not hold (it holds get, ic-reactor list methods, maybe, put)"
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // The CLI that lists them crashes, and its `gen` would succeed: the
  // comparison that did not run must not pass for one that did.
  it("of a didFile whose methods cannot be listed fail the canister, which is not generated", async () => {
    const asked = refuseNetwork()
    const app = createApp({ "did/item.did": WRITTEN }, "fake")
    apps.push(app)
    const { message } = await buildError(app, {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          methods: ["get"],
        },
      },
    })
    expect(message).toContain("could not generate 1 of 1 canisters")
    expect(lineOf(message, "item")).toContain(
      "item (did/item.did): methods cannot be compared with did/item.did, whose methods could not be listed:"
    )
    expect(message).toContain("fake trap in project")
    expect(app.runs().map(([command]) => command)).toEqual(["project"])
    expect(asked).toEqual([])
  })

  it("is projected again by IC_REACTOR_FETCH, which rewrites the file", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({ "did/ledger.did": LEDGER })
    vi.stubEnv("IC_REACTOR_FETCH", "ledger")
    const { result, lines } = runBuild(app.root, {
      canisters: {
        ledger: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: METHODS,
        },
      },
    })
    await result
    expect(lines).toContainEqual(
      expect.stringContaining(
        "rewrote did/ledger.did from the certified candid:service"
      )
    )
    expect(read(app, "did/ledger.did")).not.toContain("icrc1_name")
    expect(lines.filter((line) => line.startsWith("warn:"))).toEqual([])
  })
})

// A service small enough to change by hand, for the live check.
const WRITTEN = `type Item = record { a : nat };
service : {
  get : () -> (Item) query;
  put : (nat) -> ();
  maybe : () -> (opt nat) query;
}
`

/** `WRITTEN` with `edits` made, as the live canister now publishes it. */
const liveWith = (...edits: Array<[string, string]>) =>
  edits.reduce((text, [from, to]) => text.replace(from, to), WRITTEN)

/** `WRITTEN` without `put`. */
const WITHOUT_PUT = liveWith(["  put : (nat) -> ();\n", ""])

/**
 * The bin of a candid-core-cli that runs the real one, whose bin script is
 * `real`, and writes a file around one process (see `hookCli`). Every
 * process appends its arguments to runs.log beside it, as the fake CLI does.
 */
function hookedBin(real: string): string {
  return `const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const args = process.argv.slice(2)
const runs = path.join(__dirname, "runs.log")
fs.appendFileSync(runs, JSON.stringify(args) + "\\n")
// Held, from the process the test names on, while block.json is there.
const block = path.join(__dirname, "block.json")
try {
  const { from } = JSON.parse(fs.readFileSync(block, "utf-8"))
  const count = fs.readFileSync(runs, "utf-8").split("\\n").filter(Boolean).length
  const pause = new Int32Array(new SharedArrayBuffer(4))
  while (count >= from && fs.existsSync(block)) Atomics.wait(pause, 0, 0, 20)
} catch {}
// A projection to the empty name lists a file's methods.
const step = args[0] === "project" && args[3] === "," ? "list" : args[0]
const hook = path.join(__dirname, "hook.json")
let save
try {
  const armed = JSON.parse(fs.readFileSync(hook, "utf-8"))
  if (armed.step === step) {
    // Taken by one process alone.
    fs.renameSync(hook, hook + "." + process.pid)
    save = armed
  }
} catch {}
if (save && save.when === "before") fs.writeFileSync(save.file, save.text)
const run = spawnSync(process.execPath, [${JSON.stringify(real)}, ...args], {
  stdio: "inherit",
})
if (save && save.when === "after") fs.writeFileSync(save.file, save.text)
if (save && save.back !== undefined) fs.writeFileSync(save.file, save.back)
process.exit(run.status === null ? 1 : run.status)
`
}

/**
 * Install in `app` a candid-core-cli that runs the real one, in place of the
 * link to it, so that a test can write a `.did` at a moment it cannot time
 * otherwise: `save` writes `text` to `file` once, around the first process
 * that runs `step` (`"list"`, the projection that lists a file's methods,
 * `"check"` or `"gen"`), either `"before"` the real CLI starts or `"after"`
 * it ended, before the process exits. With `back`, the process then writes
 * `back` too, once the real CLI ended: a file saved and saved back holds its
 * text again, with another stamp. The plugin sees those writes as soon as the
 * process is done. `commands` names the command each process ran. `hold`
 * keeps each process from the `from`th one on (counted from the first)
 * waiting before the real CLI starts, until `release`.
 */
function hookCli(app: App) {
  const installed = path.join(app.root, "node_modules", "@candid-core", "cli")
  const manifest = createRequire(import.meta.url).resolve(
    "@candid-core/cli/package.json"
  )
  const { version, bin } = JSON.parse(fs.readFileSync(manifest, "utf-8")) as {
    version: string
    bin: Record<string, string>
  }
  fs.unlinkSync(installed)
  fs.mkdirSync(installed)
  fs.writeFileSync(
    path.join(installed, "package.json"),
    JSON.stringify({
      name: "@candid-core/cli",
      version,
      bin: { "candid-core-cli": "./bin.js" },
    })
  )
  fs.writeFileSync(
    path.join(installed, "bin.js"),
    hookedBin(path.join(path.dirname(manifest), bin["candid-core-cli"]))
  )
  return {
    save: (
      step: "list" | "check" | "gen",
      when: "before" | "after",
      file: string,
      text: string,
      { back }: { back?: string } = {}
    ) =>
      fs.writeFileSync(
        path.join(installed, "hook.json"),
        JSON.stringify({ step, when, file, text, back })
      ),
    commands: () => app.runs().map(([command]) => command),
    hold: (from: number) =>
      fs.writeFileSync(
        path.join(installed, "block.json"),
        JSON.stringify({ from })
      ),
    release: () =>
      fs.rmSync(path.join(installed, "block.json"), { force: true }),
  }
}

/**
 * Record what the plugin sends the browsers, through each server it is
 * handed: the first, and the one each restart creates, which Vite hands the
 * plugin before the restart's buildStart.
 */
function recordSends() {
  const spies: Array<{ mock: { calls: unknown[][] } }> = []
  const plugin: Plugin = {
    name: "record-sends",
    enforce: "pre",
    configureServer(server) {
      spies.push(vi.spyOn(server.ws, "send"))
    },
  }
  return {
    plugin,
    /** Every payload sent, in order. */
    sent: () =>
      spies.flatMap((spy) => spy.mock.calls.map(([payload]) => payload)),
  }
}

/** The error overlays among `payloads`. */
const overlays = (payloads: unknown[]) =>
  payloads.filter(
    (payload) => (payload as { type?: string } | undefined)?.type === "error"
  )

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

/**
 * A `fetch` that answers as the network does, but holds the answer to the
 * first `read_state` until `release` is called: a live check under way.
 * `reached` resolves once that answer is held, read from the canister as it
 * was then.
 */
function holdFirstReadState() {
  const real = globalThis.fetch
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let reach!: () => void
  const reached = new Promise<void>((resolve) => (reach = resolve))
  let holding = true
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const response = await real(input, init)
      const url = input instanceof Request ? input.url : String(input)
      if (holding && url.includes("/read_state")) {
        holding = false
        reach()
        await released
      }
      return response
    }
  )
  return { reached, release }
}

/**
 * A plugin of `options` under `vite build`, whose buildStart the test calls,
 * as each rebuild of `vite build --watch` does. `newRun` resolves the config
 * again, as the next build or a restart does.
 */
function drivenPlugin(app: App, options: IcReactorPluginOptions) {
  const plugin = icReactor(options) as Plugin & {
    configResolved: (config: unknown) => void
    buildStart: (this: unknown) => Promise<void>
  }
  const { logger, lines } = recordingLogger()
  const newRun = () =>
    plugin.configResolved({ root: app.root, command: "build", logger })
  newRun()
  const context = { addWatchFile: vi.fn(), error: vi.fn() }
  return {
    buildStart: () => plugin.buildStart.call(context),
    newRun,
    context,
    lines,
  }
}

/** The options of one canister, `item`, checked live against `host`. */
const checkedLive = (host: string): IcReactorPluginOptions => ({
  canisters: {
    item: {
      didFile: "did/item.did",
      canisterId: LEDGER_ID,
      network: { host },
      verify: "live",
    },
  },
})

/** A plugin for one canister checked live, as `drivenPlugin`. */
const verifyingPlugin = (app: App, host: string) =>
  drivenPlugin(app, checkedLive(host))

describe("the live check", () => {
  const checked = (host: string): IcReactorPluginOptions => ({
    canisters: {
      item: {
        didFile: "did/item.did",
        canisterId: LEDGER_ID,
        network: { host },
        verify: "live",
      },
    },
  })

  it("passes when the live interface is unchanged, and is made once for one text", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WRITTEN } })
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, context, lines } = verifyingPlugin(app, ic.host)

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(lines).toContainEqual(
      `info: ic-reactor: item: did/item.did matches the live interface of ${LEDGER_ID} on ${ic.host}`
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(ic.requests).toEqual([
      "GET /api/v2/status",
      `POST /api/v3/canister/${LEDGER_ID}/read_state`,
    ])

    // Vite 6+'s second buildStart, or a rebuild of `vite build --watch`.
    await buildStart()
    expect(ic.requests).toHaveLength(2)
  })

  // A rebuild of `vite build --watch` is the same run, so it may reuse a
  // pass. Not after a check of the canister failed: restoring the text that
  // passed must not stand in for a check, whether the network is down or the
  // canister changed. Each refused check retries with the agent's backoff,
  // which takes about 5 s, past vitest's default timeout on a loaded machine.
  it("checks a text that passed again once a check of the canister failed, so restoring it is no pass", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: WRITTEN },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, context } = verifyingPlugin(app, ic.host)
    const file = path.join(app.root, "did/item.did")
    const edited = `// Edited.\n${WRITTEN}`
    const lastError = () => String(context.error.mock.lastCall?.[0])

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(ic.requests).toHaveLength(2)

    // The network goes down, and an edit's check cannot be made.
    const asked = refuseNetwork()
    fs.writeFileSync(file, edited)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain(`could not reach ${ic.host}`)
    const refused = asked.length
    expect(refused).toBeGreaterThan(0)

    // The text that passed is restored: checked again, and still not made.
    fs.writeFileSync(file, WRITTEN)
    await buildStart()
    expect(asked.length).toBeGreaterThan(refused)
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(lastError()).toContain(`could not reach ${ic.host}`)

    // The network is back: it passes.
    vi.unstubAllGlobals()
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(ic.requests).toHaveLength(4)

    // The canister loses put, and an edit's check fails.
    canisters[LEDGER_ID] = { candid: liveWith(["  put : (nat) -> ();\n", ""]) }
    fs.writeFileSync(file, edited)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(3)
    expect(ic.requests).toHaveLength(6)
    const incompatible = `incompatible with did/item.did (1 error)`
    expect(lastError()).toContain(incompatible)

    // The text that passed is restored: checked again, and it fails.
    fs.writeFileSync(file, WRITTEN)
    await buildStart()
    expect(ic.requests).toHaveLength(8)
    expect(context.error).toHaveBeenCalledTimes(4)
    expect(lastError()).toContain(incompatible)
  }, 30_000)

  // A fetch reads the live interface, as a check does: a text that passed
  // before must not stand for a canister the plugin has just read without
  // it, nor for one it could not read.
  it("checks a text that passed again once a fetch of its didFile read another interface", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: WRITTEN },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, context } = verifyingPlugin(app, ic.host)
    const file = path.join(app.root, "did/item.did")
    const withoutPut = liveWith(["  put : (nat) -> ();\n", ""])

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(ic.requests).toHaveLength(2)

    // The canister loses put, and the file is deleted: fetched, without put.
    canisters[LEDGER_ID] = { candid: withoutPut }
    fs.rmSync(file)
    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(read(app, "did/item.did")).toBe(withoutPut)
    expect(ic.requests).toHaveLength(4)

    // The text that passed, with put, is restored: checked again, it fails.
    fs.writeFileSync(file, WRITTEN)
    await buildStart()
    expect(ic.requests).toHaveLength(6)
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(String(context.error.mock.lastCall?.[0])).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )

    // Fetched again, it passes as fetched: the next rebuild checks nothing.
    fs.rmSync(file)
    await buildStart()
    expect(ic.requests).toHaveLength(8)
    await buildStart()
    expect(ic.requests).toHaveLength(8)
    expect(context.error).toHaveBeenCalledTimes(1)
  })

  // Each refused fetch or check retries with the agent's backoff, about 5 s.
  it("checks a text that passed again once a fetch of its didFile failed", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WRITTEN } })
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, context } = verifyingPlugin(app, ic.host)
    const file = path.join(app.root, "did/item.did")
    const lastError = () => String(context.error.mock.lastCall?.[0])

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(ic.requests).toHaveLength(2)

    // The network goes down, and the file is deleted: the fetch fails.
    const asked = refuseNetwork()
    fs.rmSync(file)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain(`could not reach ${ic.host}`)
    const refused = asked.length
    expect(refused).toBeGreaterThan(0)

    // The text that passed is restored with the network still down: checked
    // again, and still not made.
    fs.writeFileSync(file, WRITTEN)
    await buildStart()
    expect(asked.length).toBeGreaterThan(refused)
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(lastError()).toContain(`could not reach ${ic.host}`)
  }, 30_000)

  // Two builds of one plugin object (a programmatic build() called twice, or
  // a framework's server build then client build) are two runs.
  it("that passed in one build runs again in the next build of the same plugin object", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: WRITTEN },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, newRun, context } = verifyingPlugin(app, ic.host)

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(ic.requests).toHaveLength(2)

    // The canister loses put, the .did is unchanged, and the next build
    // resolves its config.
    canisters[LEDGER_ID] = { candid: liveWith(["  put : (nat) -> ();\n", ""]) }
    newRun()
    await buildStart()
    expect(ic.requests).toHaveLength(4)
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(String(context.error.mock.lastCall?.[0])).toContain(
      `incompatible with did/item.did (1 error)`
    )
  })

  // Vite's restart resolves the new config, and runs the new server's
  // buildStart, before it closes the old server: a check of the old run that
  // ends after that must not pass for the new run.
  it("of a run that ends after a restart started another passes nothing for the new run", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: WRITTEN },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, newRun, context } = verifyingPlugin(app, ic.host)
    const { reached, release } = holdFirstReadState()

    const before = buildStart()
    // The old run read the canister as it was, and its check is under way.
    await reached
    canisters[LEDGER_ID] = { candid: liveWith(["  put : (nat) -> ();\n", ""]) }
    newRun()
    const after = buildStart()
    release()
    await before
    await after

    // The old run's check passed; the new run's checked again, and failed.
    expect(ic.requests).toHaveLength(4)
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(String(context.error.mock.lastCall?.[0])).toContain(
      `incompatible with did/item.did (1 error)`
    )
  })

  // candid-core-cli reads the file itself, after the fetch: a save while the
  // fetch is under way is what it checks, not the text the run read. The text
  // read first, which no check saw, must not pass when it is restored.
  it("records no pass for a didFile saved while its check ran, so restoring the text read first is checked", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WITHOUT_PUT } })
    // Incompatible: the file has put, which the canister lacks.
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, context } = verifyingPlugin(app, ic.host)
    const file = path.join(app.root, "did/item.did")
    const lastError = () => String(context.error.mock.lastCall?.[0])
    const { reached, release } = holdFirstReadState()

    const run = buildStart()
    await reached
    // Saved to the canister's interface while the fetch is held.
    fs.writeFileSync(file, WITHOUT_PUT)
    release()
    await run
    // The saved text was checked, and passed; but the build had read the
    // file before, so it takes nothing of it.
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain("did/item.did changed during the build")
    expect(ic.requests).toHaveLength(2)
    expect(exists(app, "src/canisters/item.ts")).toBe(false)

    // The text read first is restored: checked, and it fails.
    fs.writeFileSync(file, WRITTEN)
    await buildStart()
    expect(ic.requests).toHaveLength(4)
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(lastError()).toContain(`incompatible with did/item.did (1 error)`)
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  it("warns on a compatible change, and generates", async () => {
    const ic = await fakeIc({
      // A field added to a result and a method added: compatible.
      [LEDGER_ID]: {
        candid: liveWith(
          ["record { a : nat }", "record { a : nat; b : opt text }"],
          ["put : (nat) -> ();", "put : (nat) -> ();\n  added : () -> ();"]
        ),
      },
      // An opt whose content changed: compatible, but read as null.
      [OTHER_ID]: { candid: liveWith(["(opt nat)", "(opt text)"]) },
    })
    const app = newApp({ "did/item.did": WRITTEN, "did/opt.did": WRITTEN })
    const { result, lines } = runBuild(app.root, {
      canisters: {
        item: checked(ic.host).canisters!.item,
        opt: {
          didFile: "did/opt.did",
          canisterId: OTHER_ID,
          network: { host: ic.host },
          verify: "live",
        },
      },
    })
    await result
    expect(lines).toContainEqual(
      `warn: ic-reactor: item: ${LEDGER_ID} on ${ic.host} changed compatibly for the methods of did/item.did: ` +
        `its module still works. To take the change, fetch did/item.did again with IC_REACTOR_FETCH=item.`
    )
    const opt = lines.find((line) => line.startsWith("warn: ic-reactor: opt:"))
    expect(opt).toContain(
      `${OTHER_ID} on ${ic.host} is compatible with did/opt.did, with 1 warning`
    )
    expect(opt).toContain("maybe: special_opt_rule at $results[0]: ")
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(exists(app, "src/canisters/opt.ts")).toBe(true)
  })

  it("fails the build on a method that is missing, changed mode or became incompatible, naming the canister and each method", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: {
        candid: liveWith(
          ["record { a : nat }", "record { a : text }"],
          ["  put : (nat) -> ();\n", ""],
          ["(opt nat) query", "(opt nat)"]
        ),
      },
    })
    const app = newApp({ "did/item.did": WRITTEN })
    const { message } = await buildError(app, checked(ic.host))
    expect(message).toContain("could not generate 1 of 1 canisters")
    expect(message).toContain(
      `- item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (3 errors):`
    )
    expect(message).toContain("get: method_incompatible at $results[0].a: ")
    expect(message).toContain("maybe: mode_changed: ")
    expect(message).toContain(
      'put: method_missing: the live service has no method "put"'
    )
    expect(message).toContain(
      "fetch did/item.did again with IC_REACTOR_FETCH=item, regenerate, and fix the calls the type checker then reports."
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  it("follows failOnError: logged, and the other canisters generated", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      canisters: {
        ...checked(ic.host).canisters,
        ping: { didFile: "did/ping.did" },
      },
    })
    await result
    const errors = lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("could not generate 1 of 2 canisters")
    expect(errors[0]).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  it("runs for IC_REACTOR_VERIFY, and without it or verify nothing is fetched", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const options: IcReactorPluginOptions = {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
        },
        // No canisterId: nothing to check against, and `1` passes it over.
        ping: { didFile: "did/ping.did" },
      },
    }

    await runBuild(app.root, options).result
    expect(ic.requests).toEqual([])

    vi.stubEnv("IC_REACTOR_VERIFY", "1")
    const { message } = await buildError(app, options)
    expect(message).toContain("could not generate 1 of 2 canisters")
    expect(lineOf(message, "item")).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )
    expect(ic.requests).toHaveLength(2)

    // By name, as IC_REACTOR_FETCH: a canister with no canisterId fails.
    vi.stubEnv("IC_REACTOR_VERIFY", "ping")
    const named = await buildError(app, options)
    expect(lineOf(named.message, "ping")).toContain(
      "ping (did/ping.did): IC_REACTOR_VERIFY asks for its live check, but it names no canisterId"
    )
  })

  it("is off for IC_REACTOR_VERIFY=0, over verify: live, with no request", async () => {
    // Incompatible, so a check that ran would fail the build.
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN })

    for (const value of ["0", "false"]) {
      vi.stubEnv("IC_REACTOR_VERIFY", value)
      const { result, lines } = runBuild(app.root, checked(ic.host))
      await result
      expect(lines.filter((line) => !line.startsWith("info:"))).toEqual([])
      expect(exists(app, "src/canisters/item.ts")).toBe(true)
    }
    expect(ic.requests).toEqual([])

    // A name next to 0 is not checked either, and the run says so.
    vi.stubEnv("IC_REACTOR_VERIFY", "0,item")
    const { result, lines } = runBuild(app.root, checked(ic.host))
    await result
    expect(lines).toContain(
      'warn: ic-reactor: IC_REACTOR_VERIFY is "0,item", and 0 turns the live check off: no canister is checked'
    )
    expect(ic.requests).toEqual([])
  })

  // A save makes no request, so it cannot tell that the file matches the
  // canister again: whatever it changed, the failure stands, in the log and
  // the overlay, until a check passes when the server starts again.
  it("that failed under vite dev stands when the .did is saved, changed or not, until a check passes at the next start", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const { connections, plugin } = spyOnConnections()
    const running = await startDev(app.root, checked(ic.host), {
      before: [plugin],
    })
    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      await running.close()
    }
    closers.push(close)
    const failure =
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} ` +
      `incompatible with did/item.did (1 error)`
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(failure)
    expect(ic.requests).toHaveLength(2)
    const send = vi.spyOn(running.server.ws, "send")

    // Saved as it is (a touch), then with an edit that changes no method.
    const file = path.join(app.root, "did/item.did")
    for (const text of [WRITTEN, `// Edited.\n${WRITTEN}`]) {
      const before = errors().length
      fs.writeFileSync(file, text)
      running.server.watcher.emit("change", file)
      await vi.waitFor(() => expect(errors()).toHaveLength(before + 1))
      expect(errors()[before]).toContain(failure)
      expect(errors()[before]).toContain(
        "did/item.did was saved, and a save makes no request: this stands until a live check passes, which runs when the dev server restarts."
      )
      expect(send).not.toHaveBeenCalledWith({ type: "full-reload" })
      expect(
        running.lines.filter((line) => line.includes("changed, regenerating"))
      ).toEqual([])
      // A browser that connects now is handed it.
      const client = { send: vi.fn() }
      connections[0](client)
      expect(client.send).toHaveBeenCalledTimes(1)
      expect(
        JSON.parse(client.send.mock.calls[0][0] as string).err.message
      ).toContain(failure)
    }
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(ic.requests).toHaveLength(2)

    // The canister is put back: the next start checks again, and it passes.
    canisters[LEDGER_ID] = { candid: WRITTEN }
    await close()
    const next = await startDev(app.root, checked(ic.host))
    closers.push(next.close)
    expect(next.lines.filter((line) => line.startsWith("error:"))).toEqual([])
    expect(next.lines).toContainEqual(
      `info: ic-reactor: item: did/item.did matches the live interface of ${LEDGER_ID} on ${ic.host}`
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(ic.requests).toHaveLength(4)
  })

  // `r` and Enter restarts the server with the same plugin object, so the
  // failure it holds must be cleared by the check that passes, or the next
  // save would still stand on it.
  it("that failed under vite dev is cleared by a check that passes when the same server restarts, and a save then regenerates", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const running = await startDev(app.root, checked(ic.host))
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(false)

    // The canister is put back, and the same server restarts.
    canisters[LEDGER_ID] = { candid: WRITTEN }
    await running.server.restart()
    expect(running.lines).toContainEqual(
      `info: ic-reactor: item: did/item.did matches the live interface of ${LEDGER_ID} on ${ic.host}`
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(ic.requests).toHaveLength(4)

    // A save now regenerates, with no request and no new error.
    fs.rmSync(path.join(app.root, "src/canisters/item.ts"))
    const generatedLine =
      "info: ic-reactor: generated item into src/canisters/item.ts"
    const before = running.lines.filter((line) => line === generatedLine).length
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, `// Edited.\n${WRITTEN}`)
    running.server.watcher.emit("change", file)
    await vi.waitFor(() =>
      expect(
        running.lines.filter((line) => line === generatedLine)
      ).toHaveLength(before + 1)
    )
    expect(running.lines).toContain(
      "info: ic-reactor: did/item.did changed, regenerating item"
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(errors()).toHaveLength(1)
    expect(ic.requests).toHaveLength(4)
  })

  // The restart keeps the plugin object, and with it what passed: a pass of
  // the server before must not stand for the canister now.
  it("that passed under vite dev runs again when the same server restarts, and finds a canister that changed since", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: WRITTEN },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const running = await startDev(app.root, checked(ic.host))
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toEqual([])
    expect(running.lines).toContainEqual(
      `info: ic-reactor: item: did/item.did matches the live interface of ${LEDGER_ID} on ${ic.host}`
    )
    // One check for the server, whatever the number of its environments.
    expect(ic.requests).toHaveLength(2)

    // The canister loses put, the .did is unchanged, and the server restarts.
    canisters[LEDGER_ID] = { candid: liveWith(["  put : (nat) -> ();\n", ""]) }
    await running.server.restart()
    expect(ic.requests).toHaveLength(4)
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )
  })

  // Only a check that ran and passed clears a failure: a restart that fails
  // the canister before its check (here, its file lacks a name of its
  // `methods`) leaves it standing, so restoring that file does not serve
  // bindings known not to match the canister.
  it("that failed under vite dev stands through a restart that fails the canister before its check", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN })
    const options = checked(ic.host)
    options.canisters!.item = {
      ...options.canisters!.item,
      methods: ["get", "put", "maybe"],
    }
    const running = await startDev(app.root, options)
    closers.push(running.close)
    const failure =
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} ` +
      `incompatible with did/item.did (1 error)`
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(failure)
    expect(ic.requests).toHaveLength(2)

    // The file loses put, and the same server restarts: the methods
    // comparison fails the canister, so its live check does not run.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, liveWith(["  put : (nat) -> ();\n", ""]))
    await running.server.restart()
    expect(errors()).toHaveLength(2)
    expect(errors()[1]).not.toContain(failure)
    expect(errors()[1]).toContain(
      "item (did/item.did): methods names put, which did/item.did does not hold (it holds get, maybe)"
    )
    expect(ic.requests).toHaveLength(2)

    // put is restored and saved: the live failure still stands.
    fs.writeFileSync(file, WRITTEN)
    running.server.watcher.emit("change", file)
    await vi.waitFor(() => expect(errors()).toHaveLength(3))
    expect(errors()[2]).toContain(failure)
    expect(
      running.lines.filter((line) => line.includes("changed, regenerating"))
    ).toEqual([])
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(ic.requests).toHaveLength(2)
  })

  it("that cannot read the canister fails it, and says how to turn the check off", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { private: true } })
    const app = newApp({ "did/item.did": WRITTEN })
    const { message } = await buildError(app, checked(ic.host))
    expect(lineOf(message, "item")).toContain(
      `item (did/item.did): ${ic.host} refused to read the candid:service of ${LEDGER_ID} (HTTP 403`
    )
    expect(lineOf(message, "item")).toContain(
      'the live check cannot read it, so build with IC_REACTOR_VERIFY=0, and stop asking for the check of did/item.did (remove its verify: "live", or its name from IC_REACTOR_VERIFY).'
    )
    expect(read(app, "did/item.did")).toBe(WRITTEN)
  })
})

// A run reads each didFile once, when its steps start, and candid-core-cli
// reads it again for each step (the methods listing, the live check,
// generation). A file written in between must not pass one step for a text
// another step read: the run takes nothing of it. A build fails it, and a dev
// server queues it again, as a save does. Each save here is made by the
// CLI's own process (`hookCli`), at the moment the test names.
describe("a didFile written while a run reads it", () => {
  // A file on disk that is only compared with its methods: no request.
  const listed = (): IcReactorPluginOptions => ({
    canisters: {
      item: {
        didFile: "did/item.did",
        canisterId: LEDGER_ID,
        methods: ["get", "maybe", "put"],
      },
    },
  })
  const changed =
    "item (did/item.did): did/item.did changed during the build, after the build read it"
  const lacksPut =
    "item (did/item.did): methods names put, which did/item.did does not hold (it holds get, maybe)"

  // The check passes the text it read; the text saved after it must not be
  // generated as if it had been checked.
  it("fails the build when saved after the live check read it, and generates nothing of the saved text", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WITHOUT_PUT } })
    // Compatible: the canister's own interface.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    const { buildStart, context } = verifyingPlugin(app, ic.host)
    const file = path.join(app.root, "did/item.did")
    const lastError = () => String(context.error.mock.lastCall?.[0])

    // put, which the canister lacks, is saved once check has read the file.
    cli.save("check", "after", file, WRITTEN)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain(changed)
    expect(cli.commands()).not.toContain("gen")
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(ic.requests).toHaveLength(2)

    // The next build checks the text saved, and it fails.
    await buildStart()
    expect(ic.requests).toHaveLength(4)
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(lastError()).toContain("incompatible with did/item.did (1 error)")
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  // The stamp, and not the text alone, tells a file saved and saved back:
  // check reads a text the build never read, and once check is done the
  // file holds the build's text again.
  it("fails the build when saved and saved back while the live check read it, and records no pass", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WITHOUT_PUT } })
    // Incompatible: the file has put, which the canister lacks.
    const app = newApp({ "did/item.did": WRITTEN })
    const cli = hookCli(app)
    const { buildStart, context, lines } = verifyingPlugin(app, ic.host)
    const file = path.join(app.root, "did/item.did")
    const lastError = () => String(context.error.mock.lastCall?.[0])

    // put is taken out just before check reads the file, and saved back once
    // check is done: check passes the text without it.
    cli.save("check", "before", file, WITHOUT_PUT, { back: WRITTEN })
    await buildStart()
    expect(read(app, "did/item.did")).toBe(WRITTEN)
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain(changed)
    expect(cli.commands()).not.toContain("gen")
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    // What that check found is not logged either.
    expect(lines.filter((line) => line.includes("live interface"))).toEqual([])
    expect(ic.requests).toHaveLength(2)

    // The next build checks the file, and it fails.
    await buildStart()
    expect(ic.requests).toHaveLength(4)
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(lastError()).toContain("incompatible with did/item.did (1 error)")
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  // The listing approves the text it read; the text saved after it, which
  // lacks a method the list names, must not be generated as if listed.
  it("fails the build when saved after its methods were listed, and generates nothing of the saved text", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN })
    const cli = hookCli(app)

    // Saved without put, which methods names, once the file was listed.
    cli.save("list", "after", path.join(app.root, "did/item.did"), WITHOUT_PUT)
    const { message } = await buildError(app, listed())
    expect(lineOf(message, "item")).toContain(changed)
    expect(cli.commands()).toEqual(["project"])
    expect(exists(app, "src/canisters/item.ts")).toBe(false)

    // The next build lists the text saved, which lacks put.
    const again = await buildError(app, listed())
    expect(lineOf(again.message, "item")).toContain(lacksPut)
    expect(asked).toEqual([])
  })

  // Saved and saved back around the listing, the file lacked put only for
  // the CLI: the build fails it as changed, for that reason alone, and does
  // not report what the CLI listed of the other text.
  it("fails the build when saved and saved back while its methods were listed, for that reason alone, and lists the file again", async () => {
    const asked = refuseNetwork()
    // The file holds every method of methods.
    const app = newApp({ "did/item.did": WRITTEN })
    const cli = hookCli(app)
    const { buildStart, context } = drivenPlugin(app, listed())
    const file = path.join(app.root, "did/item.did")
    const lastError = () => String(context.error.mock.lastCall?.[0])

    // put is taken out just before the CLI lists the file, and saved back
    // once it is done.
    cli.save("list", "before", file, WITHOUT_PUT, { back: WRITTEN })
    await buildStart()
    expect(read(app, "did/item.did")).toBe(WRITTEN)
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain("could not generate 1 of 1 canisters")
    expect(lineOf(lastError(), "item")).toContain(changed)
    expect(lastError()).not.toContain("methods names put")
    expect(cli.commands()).toEqual(["project"])

    // The next build lists the file again: it holds put, and generates.
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(cli.commands()).toEqual(["project", "project", "gen"])
    expect(read(app, "src/canisters/item.ts")).toMatch(/\bput\b/)
    expect(asked).toEqual([])
  })

  // A file found written before generation is not handed to the generator,
  // which would write its module (a hot update, under vite dev) only for it
  // to be put back.
  it("fails the build when saved while another canister's methods were listed, and runs no generator on it", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const cli = hookCli(app)
    const { buildStart, context } = drivenPlugin(app, {
      canisters: {
        ...listed().canisters,
        ping: { didFile: "did/ping.did" },
      },
    })

    // ping's file is saved once item's methods were listed.
    const ping = path.join(app.root, "did/ping.did")
    cli.save("list", "after", ping, `// Saved.\n${PING_DID}`)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    const message = String(context.error.mock.lastCall?.[0])
    expect(message).toContain("could not generate 1 of 2 canisters")
    expect(lineOf(message, "ping")).toContain(
      "ping (did/ping.did): did/ping.did changed during the build, after the build read it"
    )
    // One generator, for item alone.
    const generators = app.runs().filter(([command]) => command === "gen")
    expect(generators).toHaveLength(1)
    expect(generators[0]).toContain(path.join(app.root, "did/item.did"))
    expect(generators[0]).not.toContain(ping)
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(exists(app, "src/canisters/ping.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // The listing read the file after the run did: what it found is not the
  // run's text, and must not be recorded for it.
  it("records no listing for the text read first when saved before its methods were listed, so restoring that text is listed again", async () => {
    const asked = refuseNetwork()
    // put, which methods names, is not in the file: the canister fails.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    const { buildStart, context } = drivenPlugin(app, listed())
    const file = path.join(app.root, "did/item.did")
    const lastError = () => String(context.error.mock.lastCall?.[0])

    // Saved with put once the run read the file, before the CLI lists it.
    cli.save("list", "before", file, WRITTEN)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(lastError()).toContain(changed)

    // The text read first is restored: listed again, it lacks put.
    fs.writeFileSync(file, WITHOUT_PUT)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(2)
    expect(lastError()).toContain(lacksPut)
    expect(cli.commands()).toEqual(["project", "project"])
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // The generator read the file after the run did: the module it wrote may
  // be of a text the run never read.
  it("fails the build when saved as the generator starts, and puts the module back as it was", async () => {
    const app = newApp({ "did/item.did": WRITTEN })
    const cli = hookCli(app)
    const { buildStart, context } = drivenPlugin(app, {
      canisters: { item: { didFile: "did/item.did" } },
    })
    const file = path.join(app.root, "did/item.did")
    const module = () => read(app, "src/canisters/item.ts")

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    const first = module()
    expect(first).toMatch(/\bmaybe\b/)

    // An edit without maybe is read by the run; once it is, a text without
    // put is saved, just before the generator reads the file.
    const withoutMaybe = liveWith(["  maybe : () -> (opt nat) query;\n", ""])
    fs.writeFileSync(file, withoutMaybe)
    cli.save("gen", "before", file, WITHOUT_PUT)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(String(context.error.mock.lastCall?.[0])).toContain(changed)
    expect(cli.commands()).toEqual(["gen", "gen"])
    expect(module()).toBe(first)

    // The edit is saved again: generated now, since the run before took
    // nothing of it.
    fs.writeFileSync(file, withoutMaybe)
    await buildStart()
    expect(context.error).toHaveBeenCalledTimes(1)
    expect(module()).not.toMatch(/\bmaybe\b/)
    expect(module()).toMatch(/\bput\b/)
  })

  // A save's run lists the file and generates it with no request: saved
  // again in between, it is listed again, as the save it is, and the save's
  // own run says nothing of it. Each dev test here has room past its wait,
  // so that what it waits for fails by the wait's own assertion.
  it("under vite dev, is queued again as a save is when saved after a save's run listed it, and that run says nothing of it", async () => {
    const asked = refuseNetwork()
    // put, which methods names, is not in the file: the start fails it.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    const sends = recordSends()
    const running = await startDev(app.root, listed(), {
      before: [sends.plugin],
    })
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(lacksPut)
    const sentAtStart = sends.sent().length

    // An edit that adds put is saved; once the save's run listed it, the
    // text without put is saved again.
    const file = path.join(app.root, "did/item.did")
    cli.save("list", "after", file, WITHOUT_PUT)
    fs.writeFileSync(file, `// Edited.\n${WRITTEN}`)
    running.server.watcher.emit("change", file)
    await vi.waitFor(() => expect(errors()).toHaveLength(2), {
      timeout: 10_000,
    })
    expect(errors()[1]).toContain(lacksPut)
    // The save's run, which took nothing, and the run it queued.
    expect(
      running.lines.filter(
        (line) =>
          line === "info: ic-reactor: did/item.did changed, regenerating item"
      )
    ).toHaveLength(2)
    // The save's run neither showed a failure nor reloaded the page as for a
    // canister fixed: only the queued run's overlay was sent.
    const sent = sends.sent().slice(sentAtStart)
    expect(sent).not.toContainEqual({ type: "full-reload" })
    expect(overlays(sent)).toHaveLength(1)
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  }, 30_000)

  // The generator of a save's run read the file after the run did, so the
  // module it wrote may be of a text the run never read: the run puts the
  // module back, says nothing of the file, and queues it again. It can know
  // only once the generator is done.
  it("under vite dev, is queued again as a save is when saved as a save's generator starts, and that run says nothing of it", async () => {
    const asked = refuseNetwork()
    // put, which methods names, is not in the file: the start fails it.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    const sends = recordSends()
    const running = await startDev(app.root, listed(), {
      before: [sends.plugin],
    })
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(lacksPut)
    const sentAtStart = sends.sent().length

    // An edit that adds put is saved, and the save's run lists it; just
    // before the run's generator reads the file, the text without put is
    // saved again.
    const file = path.join(app.root, "did/item.did")
    cli.save("gen", "before", file, WITHOUT_PUT)
    fs.writeFileSync(file, `// Edited.\n${WRITTEN}`)
    running.server.watcher.emit("change", file)
    await vi.waitFor(() => expect(errors()).toHaveLength(2), {
      timeout: 10_000,
    })
    expect(errors()[1]).toContain(lacksPut)
    // The start's listing, the save's listing and generator, and the queued
    // run's listing of the text saved.
    expect(cli.commands()).toEqual(["project", "project", "gen", "project"])
    expect(
      running.lines.filter(
        (line) =>
          line === "info: ic-reactor: did/item.did changed, regenerating item"
      )
    ).toHaveLength(2)
    // The save's run neither showed a failure nor reloaded the page as for a
    // canister fixed, nor logged a module: only the queued run's overlay was
    // sent, and the module of the text saved was put back.
    const sent = sends.sent().slice(sentAtStart)
    expect(sent).not.toContainEqual({ type: "full-reload" })
    expect(overlays(sent)).toHaveLength(1)
    expect(
      running.lines.filter((line) => line.includes("ic-reactor: generated"))
    ).toEqual([])
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  }, 30_000)

  // A restart keeps the plugin object, and the failures it shows: a
  // restart's run that took nothing of a file says nothing of it, not even
  // that the canister is fixed, and the run it queues reports it.
  it("under vite dev, says nothing of a file saved during a restart's listing, and the run it queues reports it", async () => {
    const asked = refuseNetwork()
    // put, which methods names, is not in the file: the start fails it.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    const sends = recordSends()
    const running = await startDev(app.root, listed(), {
      before: [sends.plugin],
    })
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(lacksPut)
    const sentAtStart = sends.sent().length

    // An edit that adds put is written, and the same server restarts; once
    // the restart's run listed the edit, the text without put is saved
    // again. The start listed that text, so the run queued for it needs no
    // process: the plugin object outlives the restart of an inline config,
    // and the old server's close would stop one.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, `// Edited.\n${WRITTEN}`)
    cli.save("list", "after", file, WITHOUT_PUT)
    await running.server.restart()
    await vi.waitFor(() => expect(errors()).toHaveLength(2), {
      timeout: 10_000,
    })
    expect(errors()[1]).toContain(lacksPut)
    expect(
      running.lines.filter(
        (line) =>
          line === "info: ic-reactor: did/item.did changed, regenerating item"
      )
    ).toHaveLength(1)
    // The restart's run neither showed a failure nor reloaded the page as
    // for a canister fixed: only the queued run's overlay was sent.
    const sent = sends.sent().slice(sentAtStart)
    expect(sent).not.toContainEqual({ type: "full-reload" })
    expect(overlays(sent)).toHaveLength(1)
    expect(cli.commands()).toEqual(["project", "project"])
    expect(asked).toEqual([])
  }, 30_000)

  // A check that failed what it read, while the file was saved and saved
  // back, is no failure of the file: it sets no failure that stands, and the
  // save the start queued generates the file.
  it("under vite dev, sets no failed check when saved and saved back while the start's check read it, and the queued save generates", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WITHOUT_PUT } })
    // Compatible: the canister's own interface.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    // put, which the canister lacks, is saved just before the start's check
    // reads the file, and the file is saved back once check is done.
    const file = path.join(app.root, "did/item.did")
    cli.save("check", "before", file, WRITTEN, { back: WITHOUT_PUT })
    const running = await startDev(app.root, checkedLive(ic.host))
    closers.push(running.close)
    const generated =
      "info: ic-reactor: generated item into src/canisters/item.ts"
    await vi.waitFor(
      () =>
        expect(
          running.lines.some(
            (line) => line === generated || line.startsWith("error:")
          )
        ).toBe(true),
      { timeout: 10_000 }
    )
    expect(running.lines.filter((line) => line.startsWith("error:"))).toEqual(
      []
    )
    expect(running.lines).toContain(
      "info: ic-reactor: did/item.did changed, regenerating item"
    )
    expect(read(app, "src/canisters/item.ts")).not.toMatch(/\bput\b/)
    // The start's check; a save makes no request.
    expect(ic.requests).toHaveLength(2)
  }, 30_000)

  // A check that passed what it read, while the file was saved, is no pass
  // of the file: a failure that stands is not cleared by it.
  it("under vite dev, leaves a failed check standing when saved after a restart's check passed the text it read", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WITHOUT_PUT } })
    // put, which the canister lacks: the check fails.
    const app = newApp({ "did/item.did": WRITTEN })
    const cli = hookCli(app)
    const running = await startDev(app.root, checkedLive(ic.host))
    closers.push(running.close)
    const failure =
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} ` +
      `incompatible with did/item.did (1 error)`
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(failure)

    // The file loses put, and the same server restarts; once the restart's
    // check has read the file, put is saved back.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, WITHOUT_PUT)
    cli.save("check", "after", file, WRITTEN)
    await running.server.restart()
    await vi.waitFor(() => expect(errors()).toHaveLength(2), {
      timeout: 10_000,
    })
    expect(errors()[1]).toContain(failure)
    expect(errors()[1]).toContain(
      "did/item.did was saved, and a save makes no request: this stands until a live check passes"
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(ic.requests).toHaveLength(4)
  }, 30_000)
})

// A JavaScript config is not type-checked: only an omitted option is one
// not given, and every value given is checked.
describe("options given a value of the wrong kind", () => {
  it("verify other than live (true, false, null, a typo) fails the canister with no request, under IC_REACTOR_VERIFY=0 too", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN })
    const options = (verify: unknown): IcReactorPluginOptions => ({
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          verify: verify as never,
        },
      },
    })
    for (const verify of [true, false, null, "Live"]) {
      const { message } = await buildError(app, options(verify))
      expect(lineOf(message, "item")).toContain(
        `item (did/item.did): verify is ${JSON.stringify(verify)}, not "live": set it to "live" for the live check, or remove it for none`
      )
    }
    vi.stubEnv("IC_REACTOR_VERIFY", "0")
    const { message } = await buildError(app, options(true))
    expect(lineOf(message, "item")).toContain('verify is true, not "live"')
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  it("canisterId given as an empty string or null is no canister ID: it fails the canister with no request, whether or not a fetch or a check would use it", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const { message } = await buildError(app, {
      canisters: {
        // Missing, so it would be fetched.
        fetched: { didFile: "did/fetched.did", canisterId: "" },
        // On disk, and checked live.
        checked: {
          didFile: "did/item.did",
          canisterId: null as never,
          verify: "live",
        },
        // On disk, neither fetched nor checked: only generated.
        unused: { didFile: "did/ping.did", canisterId: "" },
      },
    })
    expect(message).toContain("could not generate 3 of 3 canisters")
    // One reason, so one line.
    expect(message).toContain(
      '- fetched (did/fetched.did), unused (did/ping.did): canisterId is "", not a canister ID'
    )
    expect(lineOf(message, "checked")).toContain(
      "checked (did/item.did): canisterId is null, not a canister ID"
    )
    expect(exists(app, "did/fetched.did")).toBe(false)
    expect(exists(app, "src/canisters/ping.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // JSON.stringify throws on a bigint: a message built with it threw out of
  // the run, past failOnError, so a dev server that keeps serving failed its
  // start instead, with no log and no overlay.
  it("methods given as 1n or [1n] fails the canister cleanly under failOnError: false, in the log and the overlay, and nothing runs for it", async () => {
    const asked = refuseNetwork()
    const app = newApp({
      "did/a.did": PING_DID,
      "did/b.did": PING_DID,
      "did/ping.did": PING_DID,
    })
    const cli = hookCli(app)
    const { connections, plugin } = spyOnConnections()
    const running = await startDev(
      app.root,
      {
        failOnError: false,
        canisters: {
          bigint: { didFile: "did/a.did", methods: 1n as never },
          listed: { didFile: "did/b.did", methods: [1n] as never },
          ping: { didFile: "did/ping.did" },
        },
      },
      { before: [plugin] }
    )
    closers.push(running.close)
    const errors = running.lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("could not generate 2 of 3 canisters")
    expect(lineOf(errors[0], "bigint")).toContain(
      "bigint (did/a.did): methods is 1n, not a list of method names"
    )
    expect(lineOf(errors[0], "listed")).toContain(
      "listed (did/b.did): methods holds 1n, which is not a method name"
    )
    // A browser that connects is handed both.
    const client = { send: vi.fn() }
    connections[0](client)
    const shown = JSON.parse(client.send.mock.calls[0][0] as string) as {
      err: { message: string }
    }
    expect(shown.err.message).toContain("methods is 1n")
    expect(shown.err.message).toContain("methods holds 1n")
    // Nothing ran for them: no listing, and one generator, for ping alone.
    expect(cli.commands()).toEqual(["gen"])
    expect(app.runs()[0]).toContain(path.join(app.root, "did/ping.did"))
    expect(app.runs()[0]).not.toContain(path.join(app.root, "did/a.did"))
    expect(app.runs()[0]).not.toContain(path.join(app.root, "did/b.did"))
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
    expect(asked).toEqual([])
  })

  // Each kind of value a JavaScript config can give, quoted as it was given:
  // none throws its message out of the run, no getter of it runs, and none
  // costs a process.
  it("of any kind is quoted as given, fails only its canister, and runs no getter of it", async () => {
    const asked = refuseNetwork()
    const app = newApp({
      "did/a.did": PING_DID,
      "did/b.did": PING_DID,
      "did/c.did": PING_DID,
      "did/d.did": PING_DID,
      "did/e.did": PING_DID,
      "did/ping.did": PING_DID,
    })
    const cli = hookCli(app)
    const cyclic: Record<string, unknown> = { name: "a" }
    cyclic.self = cyclic
    let read = 0
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      canisters: {
        symbol: { didFile: "did/a.did", verify: Symbol("live") as never },
        cycle: { didFile: "did/b.did", methods: [cyclic] as never },
        fn: {
          didFile: "did/c.did",
          canisterId: (() => LEDGER_ID) as never,
        },
        throwing: {
          didFile: "did/d.did",
          get outDir(): string {
            throw new Error("no outDir today")
          },
        },
        accessor: {
          didFile: "did/e.did",
          methods: [
            {
              get name() {
                read += 1
                return "get"
              },
            },
          ] as never,
        },
        nul: { didFile: "did/f.did\0" },
        nil: null as never,
        ping: { didFile: "did/ping.did" },
      },
    })
    await result
    const errors = lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    const [message] = errors
    expect(message).toContain("could not generate 7 of 8 canisters")
    expect(lineOf(message, "symbol")).toContain(
      'symbol (did/a.did): verify is Symbol(live), not "live"'
    )
    expect(lineOf(message, "cycle")).toContain(
      'cycle (did/b.did): methods holds {"name":"a","self":[circular]}, which is not a method name'
    )
    expect(lineOf(message, "fn")).toContain(
      "fn (did/c.did): canisterId is a function, not a canister ID"
    )
    expect(lineOf(message, "throwing")).toContain(
      "throwing (did/d.did): outDir could not be read: no outDir today"
    )
    expect(lineOf(message, "accessor")).toContain(
      'accessor (did/e.did): methods holds {"name":[getter]}, which is not a method name'
    )
    expect(message).toContain(
      '- nul: didFile is "did/f.did\\u0000", not a path'
    )
    expect(message).toContain(
      "- nil: its options are null, not an object of options"
    )
    expect(read).toBe(0)
    expect(cli.commands()).toEqual(["gen"])
    expect(app.runs()[0]).toContain(path.join(app.root, "did/ping.did"))
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
    expect(asked).toEqual([])
  })

  // Each option is checked when the plugin is made, whether or not a step of
  // the run would use it: a file on disk that is neither fetched nor checked
  // reads no canisterId and no network, and still fails for one that is not.
  it("didFile, outDir or network that is not one fails the canister of a file on disk that nothing fetches or checks", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/a.did": PING_DID, "did/ping.did": PING_DID })
    const cli = hookCli(app)
    const { message } = await buildError(app, {
      canisters: {
        path: { didFile: 1 as never },
        empty: { didFile: "" },
        out: { didFile: "did/a.did", outDir: "" },
        network: { didFile: "did/a.did", network: "mainnet" as never },
        ping: { didFile: "did/ping.did" },
      },
    })
    expect(message).toContain("could not generate 4 of 5 canisters")
    expect(message).toContain("- path: didFile is 1, not a path")
    expect(message).toContain('- empty: didFile is "", not a path')
    expect(lineOf(message, "out")).toContain(
      'out (did/a.did): outDir is "", not a path'
    )
    expect(lineOf(message, "network")).toContain(
      'network (did/a.did): network "mainnet" is not "ic", "local" or { host: "<http or https URL>" }'
    )
    expect(cli.commands()).toEqual(["gen"])
    expect(app.runs()[0]).not.toContain(path.join(app.root, "did/a.did"))
    expect(exists(app, "src/canisters/a.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // The live check read verify, after the fetch: a verify that is not one
  // made the request and wrote the file, and only then failed the canister.
  it("verify that is not live fails the canister before its didFile is fetched: no request, and nothing written", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WRITTEN } })
    const app = newApp({ "did/committed.did": WITHOUT_PUT })
    const network = { host: ic.host }

    // Missing, so it would be fetched.
    const missing = await buildError(app, {
      canisters: {
        missing: {
          didFile: "did/missing.did",
          canisterId: LEDGER_ID,
          network,
          verify: true as never,
        },
      },
    })
    expect(lineOf(missing.message, "missing")).toContain(
      'missing (did/missing.did): verify is true, not "live"'
    )
    expect(exists(app, "did/missing.did")).toBe(false)

    // Asked for again by IC_REACTOR_FETCH: the committed file is not
    // rewritten.
    vi.stubEnv("IC_REACTOR_FETCH", "committed")
    const again = await buildError(app, {
      canisters: {
        committed: {
          didFile: "did/committed.did",
          canisterId: LEDGER_ID,
          network,
          verify: "Live" as never,
        },
      },
    })
    expect(lineOf(again.message, "committed")).toContain(
      'committed (did/committed.did): verify is "Live", not "live"'
    )
    expect(read(app, "did/committed.did")).toBe(WITHOUT_PUT)
    vi.unstubAllEnvs()

    // Shared with a canister that could fetch it: not fetched for either.
    const shared = await buildError(app, {
      canisters: {
        fetcher: { didFile: "did/shared.did", canisterId: LEDGER_ID, network },
        typo: {
          didFile: "did/shared.did",
          outDir: "src/typo",
          verify: "yes" as never,
        },
      },
    })
    expect(shared.message).toContain(
      `- fetcher (did/shared.did), typo (did/shared.did): "fetcher", "typo" name did/shared.did, which is not fetched, ` +
        `since "typo" cannot be generated (typo: verify is "yes", not "live"`
    )
    expect(exists(app, "did/shared.did")).toBe(false)
    expect(ic.requests).toEqual([])
  })

  // IC_REACTOR_VERIFY was read by the live check, after the methods of the
  // canister were listed: a canister it names that cannot be checked costs
  // nothing either.
  it("IC_REACTOR_VERIFY or IC_REACTOR_FETCH naming a canister with no canisterId fails it before the run does anything for it", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN })
    const cli = hookCli(app)
    const options: IcReactorPluginOptions = {
      canisters: {
        item: { didFile: "did/item.did", methods: ["get", "maybe", "put"] },
      },
    }
    for (const [variable, message] of [
      [
        "IC_REACTOR_VERIFY",
        "item (did/item.did): IC_REACTOR_VERIFY asks for its live check, but it names no canisterId",
      ],
      [
        "IC_REACTOR_FETCH",
        "item (did/item.did): IC_REACTOR_FETCH asks to fetch its didFile again, but it names no canisterId",
      ],
    ]) {
      vi.unstubAllEnvs()
      vi.stubEnv(variable, "item")
      const failed = await buildError(app, options)
      expect(lineOf(failed.message, "item")).toContain(message)
      expect(cli.commands()).toEqual([])
    }
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // A canister with no didFile generates nothing, and its options were read
  // no further than its canisterId: methods: 1n, verify: "nope", network: 5
  // or outDir: 3 on it were taken without a word. One whose values are all
  // values is only named in the cookie, whatever they are.
  it("of a canister with no didFile are checked as any canister's: one that is not one fails it, with no request and nothing run", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/ping.did": PING_DID })
    const cli = hookCli(app)
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      canisters: {
        typo: {
          canisterId: LEDGER_ID,
          outDir: 3 as never,
          network: 5 as never,
          methods: 1n as never,
          verify: "nope" as never,
        },
        empty: { canisterId: "" },
        // Values all, so none fails it, though nothing reads them.
        named: {
          canisterId: LEDGER_ID,
          outDir: "src/named",
          network: "ic",
          methods: ["icrc1_fee"],
          verify: "live",
        },
        ping: { didFile: "did/ping.did" },
      },
    })
    await result
    const errors = lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    const [message] = errors
    expect(message).toContain("could not generate 2 of 3 canisters")
    expect(message).toContain(
      '- typo: outDir is 3, not a path: give the directory relative to the Vite root, or remove outDir for "src/canisters"; ' +
        'network 5 is not "ic", "local" or { host: "<http or https URL>" }; ' +
        "methods is 1n, not a list of method names; " +
        'verify is "nope", not "live": set it to "live" for the live check, or remove it for none'
    )
    expect(message).toContain(
      '- empty: canisterId is "", not a canister ID: give the canister\'s principal as text, or remove canisterId'
    )
    expect(message).not.toContain("named")
    expect(cli.commands()).toEqual(["gen"])
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
    expect(exists(app, "src/named")).toBe(false)
    expect(asked).toEqual([])
  })

  // Whether text is a principal was told only by the fetch or the check that
  // read it, so a canister with methods and verify: "live" had its methods
  // listed by a candid-core-cli process before its check failed.
  it("canisterId text that is no principal fails the canister when the plugin is made, before any process or request", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const cli = hookCli(app)
    const wrong = (text: string) =>
      `canisterId is ${JSON.stringify(text)}, not a canister ID: it is not the text of a principal, ` +
      `which is lowercase, in groups of five joined by dashes, with a checksum. ` +
      `Give the canister's ID as it is printed, or remove canisterId`
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      canisters: {
        // The ledger's ID with its last letter changed: no checksum matches.
        checksum: {
          didFile: "did/item.did",
          canisterId: "ryjl3-tyaaa-aaaaa-aaaba-caj",
          methods: ["get", "maybe", "put"],
          verify: "live",
        },
        upper: {
          didFile: "did/item.did",
          outDir: "src/upper",
          canisterId: "RYJL3-TYAAA-AAAAA-AAABA-CAI",
          verify: "live",
        },
        words: { canisterId: "the ledger" },
        ping: { didFile: "did/ping.did" },
      },
    })
    await result
    const errors = lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    const [message] = errors
    expect(message).toContain("could not generate 3 of 4 canisters")
    expect(lineOf(message, "checksum")).toContain(
      `checksum (did/item.did): ${wrong("ryjl3-tyaaa-aaaaa-aaaba-caj")}`
    )
    expect(lineOf(message, "upper")).toContain(
      `upper (did/item.did): ${wrong("RYJL3-TYAAA-AAAAA-AAABA-CAI")}`
    )
    expect(message).toContain(`- words: ${wrong("the ledger")}`)
    // No listing and no check: one generator, for ping alone.
    expect(cli.commands()).toEqual(["gen"])
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  })
})

// The generator names a module after its .did, so two files of one name in
// one outDir write one module, which the first canister in the options
// keeps. The second was refused only by the generator's run, after the run
// had fetched, projected, listed and checked its file; and a save of its file
// under vite dev, whose run sees only the canisters that name the file,
// generated it over the first one's module.
describe("a canister whose module a canister before it writes", () => {
  const collision =
    'a (a/ping.did): would write src/canisters/ping.ts, which "b" already writes. ' +
    "The generator names a module after its .did file: rename one file or give one canister its own outDir"

  it("fails before the run does anything for it, its file missing or on disk: no request, no process, nothing written", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({ "b/ping.did": PING_DID })
    const cli = hookCli(app)
    const a = {
      didFile: "a/ping.did",
      canisterId: LEDGER_ID,
      network: { host: ic.host },
      methods: ["icrc1_fee"],
    }

    // Missing, so it would be fetched and projected.
    const missing = runBuild(app.root, {
      failOnError: false,
      canisters: { b: { didFile: "b/ping.did" }, a },
    })
    await missing.result
    const errors = missing.lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    expect(lineOf(errors[0], "a")).toContain(collision)
    expect(exists(app, "a/ping.did")).toBe(false)
    expect(read(app, "src/canisters/ping.ts")).not.toContain("icrc1_fee")

    // On disk, with methods to compare it with and the live check asked for.
    fs.mkdirSync(path.join(app.root, "a"))
    fs.writeFileSync(path.join(app.root, "a/ping.did"), LEDGER)
    const checked = await buildError(app, {
      canisters: { b: { didFile: "b/ping.did" }, a: { ...a, verify: "live" } },
    })
    expect(lineOf(checked.message, "a")).toContain(collision)

    // One generator for each build, for b alone.
    expect(cli.commands()).toEqual(["gen", "gen"])
    const aFile = path.join(app.root, "a/ping.did")
    expect(app.runs().filter((args) => args.includes(aFile))).toEqual([])
    expect(ic.requests).toEqual([])
  })

  it("is not generated by a save of its file under vite dev, which leaves the module as it was, nor taken for deleted with its file", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "a/ping.did": WRITTEN, "b/ping.did": PING_DID })
    const cli = hookCli(app)
    const running = await startDev(app.root, {
      canisters: {
        b: { didFile: "b/ping.did" },
        a: { didFile: "a/ping.did" },
      },
    })
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error: ic-reactor:"))
    expect(errors()).toHaveLength(1)
    expect(lineOf(errors()[0], "a")).toContain(collision)
    const module = read(app, "src/canisters/ping.ts")
    expect(module).not.toContain("maybe")

    // A save of a's file alone: a is refused again, and nothing runs for it.
    const file = path.join(app.root, "a/ping.did")
    fs.writeFileSync(file, `// Saved.\n${WRITTEN}`)
    running.server.watcher.emit("change", file)
    await vi.waitFor(() => expect(errors()).toHaveLength(2), {
      timeout: 10_000,
    })
    expect(lineOf(errors()[1], "a")).toContain(collision)
    expect(read(app, "src/canisters/ping.ts")).toBe(module)
    expect(cli.commands()).toEqual(["gen"])

    // Deleted: still refused for the module, which the file coming back
    // would not generate either.
    fs.rmSync(file)
    running.server.watcher.emit("unlink", file)
    await vi.waitFor(() => expect(errors()).toHaveLength(3), {
      timeout: 10_000,
    })
    expect(lineOf(errors()[2], "a")).toContain(collision)
    expect(errors()[2]).not.toContain("was deleted")
    expect(asked).toEqual([])
  }, 30_000)
})

/**
 * A plugin, ahead of the plugin under test, whose `closeBundle` holds each
 * server close, once armed, until `until` passes: the plugin's own
 * `closeBundle` runs after it (`sequential`), as for a server whose close
 * comes late.
 */
function holdCloses(until: () => boolean) {
  let armed = false
  const plugin: Plugin = {
    name: "hold-closes",
    enforce: "pre",
    closeBundle: {
      sequential: true,
      async handler() {
        if (!armed) return
        await vi.waitFor(() => expect(until()).toBe(true), {
          timeout: 10_000,
          interval: 10,
        })
      },
    },
  }
  return {
    plugin,
    arm: () => (armed = true),
    disarm: () => (armed = false),
  }
}

// `server.restart()` of an inline config keeps the plugin object, and Vite
// resolves the new config, and starts the new server, before it closes the
// old one. Each server's runs are its own: the old server's close stops only
// its own, and the plugin keeps what it knows of the files.
describe("a dev server restarted with the same plugin object", () => {
  const listed = (): IcReactorPluginOptions => ({
    canisters: {
      item: {
        didFile: "did/item.did",
        canisterId: LEDGER_ID,
        methods: ["get", "maybe", "put"],
      },
    },
  })
  const lacksPut =
    "item (did/item.did): methods names put, which did/item.did does not hold (it holds get, maybe)"
  // The errors below are the plugin's own: Vite 8.0.0 also logs one when a
  // restart cuts short the old server's dependency scan ("The server is being
  // restarted or closed").

  // The run the restart queues for a file saved during its listing has to
  // list the text saved, a process of its own. The old server's close comes
  // once that process runs, and is held until then; the process is held in
  // turn while the test looks at the restarted server.
  it("keeps the run its start queues for a file saved during its listing when the old server closes after that start, and the overlay as it was until that run reports", async () => {
    const asked = refuseNetwork()
    // put, which methods names, is not in the file: the start fails it.
    const app = newApp({ "did/item.did": WITHOUT_PUT })
    const cli = hookCli(app)
    const hold = holdCloses(() => cli.commands().length >= 3)
    const { connections, plugin } = spyOnConnections()
    const running = await startDev(app.root, listed(), {
      before: [hold.plugin, plugin],
    })
    closers.push(async () => {
      cli.release()
      await running.close()
    })
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error: ic-reactor:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(lacksPut)

    // An edit that adds put is written, and the same server restarts. Once
    // the restart's run listed the edit, a text without put that no run
    // listed is saved: the run queued for it lists it again, in the third
    // process, which waits.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, `// Edited.\n${WRITTEN}`)
    cli.save("list", "after", file, `// Saved again.\n${WITHOUT_PUT}`)
    cli.hold(3)
    hold.arm()
    await running.server.restart()
    hold.disarm()
    expect(cli.commands()).toEqual(["project", "project", "project"])
    expect(errors()).toHaveLength(1)
    // The restart's run took nothing of the file: a browser that connects to
    // the restarted server is handed the failure the overlay showed.
    const client = { send: vi.fn() }
    connections[connections.length - 1](client)
    const shown = JSON.parse(client.send.mock.calls[0][0] as string) as {
      err: { message: string }
    }
    expect(shown.err.message).toContain(lacksPut)

    // The queued run, which the old server's close did not stop, reports the
    // text saved.
    cli.release()
    await vi.waitFor(() => expect(errors()).toHaveLength(2), {
      timeout: 10_000,
    })
    expect(errors()[1]).toContain(lacksPut)
    expect(cli.commands()).toEqual(["project", "project", "project"])
    expect(asked).toEqual([])
  }, 30_000)

  it("lists and generates nothing again that it did, shows what still fails, and regenerates on a save", async () => {
    const asked = refuseNetwork()
    // put, which methods names, is not in item's file: the start fails it.
    const app = newApp({
      "did/item.did": WITHOUT_PUT,
      "did/ping.did": PING_DID,
    })
    const cli = hookCli(app)
    const { connections, plugin } = spyOnConnections()
    const running = await startDev(
      app.root,
      {
        canisters: {
          ...listed().canisters,
          ping: { didFile: "did/ping.did" },
        },
      },
      { before: [plugin] }
    )
    closers.push(running.close)
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error: ic-reactor:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(lacksPut)
    expect(cli.commands()).toEqual(["project", "gen"])

    await running.server.restart()
    // Nothing changed: no process runs again, and the failure is told again.
    expect(cli.commands()).toEqual(["project", "gen"])
    expect(errors()).toHaveLength(2)
    expect(errors()[1]).toContain(lacksPut)
    // A browser that connects to the restarted server is handed it.
    const client = { send: vi.fn() }
    connections[connections.length - 1](client)
    const shown = JSON.parse(client.send.mock.calls[0][0] as string) as {
      err: { message: string }
    }
    expect(shown.err.message).toContain(lacksPut)

    // put is saved back: the restarted server lists and generates item.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, WRITTEN)
    running.server.watcher.emit("change", file)
    await vi.waitFor(
      () => expect(exists(app, "src/canisters/item.ts")).toBe(true),
      {
        timeout: 10_000,
      }
    )
    expect(cli.commands()).toEqual(["project", "gen", "project", "gen"])
    expect(errors()).toHaveLength(2)
    expect(asked).toEqual([])
  }, 30_000)
})
