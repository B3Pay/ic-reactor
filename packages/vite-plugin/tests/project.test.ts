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
      `"transfer", "broken" name did/ledger.did, which is not fetched, since a list of methods cannot be projected to ` +
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
 * A plugin for one canister checked live, whose buildStart the test calls.
 * `newRun` resolves the config again, as the next build or a restart does.
 */
function verifyingPlugin(app: App, host: string) {
  const plugin = icReactor({
    canisters: {
      item: {
        didFile: "did/item.did",
        canisterId: LEDGER_ID,
        network: { host },
        verify: "live",
      },
    },
  }) as Plugin & {
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

  it("canisterId given as an empty string or null is no canister ID: the fetch and the check that would use it fail, with no request", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN })
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
      },
    })
    expect(lineOf(message, "fetched")).toContain(
      'fetched (did/fetched.did): canisterId is "", not a canister ID'
    )
    expect(lineOf(message, "checked")).toContain(
      "checked (did/item.did): canisterId is null, not a canister ID"
    )
    expect(exists(app, "did/fetched.did")).toBe(false)
    expect(asked).toEqual([])
  })
})
